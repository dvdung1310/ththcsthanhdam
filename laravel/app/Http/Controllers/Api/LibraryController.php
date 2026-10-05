<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\LibraryNode;
use App\Models\LibraryShare;
use App\Models\StoredFile;
use App\Models\Task;
use App\Models\TaskSubmission;
use App\Models\User;
use App\Services\FileStore;
use App\Services\LibraryAccess;
use App\Services\LibraryNames;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class LibraryController extends Controller
{
    private const MIMES = 'pdf,doc,docx,xls,xlsx,ppt,pptx,txt,jpg,jpeg,png,zip,rar';

    public function __construct(private FileStore $store) {}

    public function index(Request $request): JsonResponse
    {
        $access = $this->access($request);
        $folder = $request->filled('folder_id') ? LibraryNode::findOrFail($request->integer('folder_id')) : null;
        abort_if($folder && (! $folder->isFolder() || ! $access->can($folder, LibraryAccess::READ)), 403, 'Bạn không có quyền xem thư mục này.');
        $search = trim($request->string('search')->toString());

        $scope = LibraryNode::query()->with(['owner:id,name', 'file:id,size,mime_type,original_name', 'shares.user:id,name', 'shares.department:id,name']);
        if ($search !== '') {
            $ids = $access->accessibleIds();
            $scope->when($ids !== null, fn ($q) => $q->whereIn('id', $ids ?: [0]))->where('name', 'like', "%{$search}%");
        } elseif ($folder) {
            $scope->where('parent_id', $folder->id);
        } elseif ($access->manages()) {
            $scope->whereNull('parent_id');
        } else {
            $scope->whereIn('id', $access->accessibleRootIds() ?: [0]);
        }

        $folders = (clone $scope)->where('type', LibraryNode::FOLDER)->withCount('children')->orderByDesc('is_system')->orderBy('name')->get();
        $files = (clone $scope)->where('type', LibraryNode::FILE)
            ->when($request->string('file_type')->toString(), fn ($q, $type) => $q->whereHas('file', fn ($f) => $this->filterMime($f, $type)));
        match ($request->string('sort')->toString()) {
            'oldest' => $files->oldest('created_at'),
            'name_asc' => $files->orderBy('name'),
            'name_desc' => $files->orderByDesc('name'),
            default => $files->latest('created_at'),
        };
        $paginator = $files->latest('id')->paginate(min(max($request->integer('per_page', 20), 5), 100));

        return response()->json([
            'folder' => $folder ? [...$this->serialize($folder, $access), 'breadcrumbs' => $this->breadcrumbs($folder, $access)] : null,
            'root' => ['can_upload' => $access->canWriteRoot(), 'manages' => $access->manages()],
            'folders' => $folders->map(fn ($node) => $this->serialize($node, $access))->values(),
            'data' => collect($paginator->items())->map(fn ($node) => $this->serialize($node, $access, $search !== ''))->values(),
            'meta' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()],
            'tree' => $this->tree($access),
        ]);
    }

    public function storeFolder(Request $request): JsonResponse
    {
        $access = $this->access($request);
        $data = $request->validate(['parent_id' => ['nullable', 'integer', 'exists:library_nodes,id'], 'name' => ['required', 'string', 'max:150']]);
        $parent = $this->targetFolder($data['parent_id'] ?? null);
        abort_unless($access->can($parent, LibraryAccess::UPLOAD), 403, 'Bạn không có quyền tạo thư mục ở đây.');
        $name = trim($data['name']);
        if (LibraryNames::existing($parent?->id, $name)) {
            return $this->nameTaken($parent?->id, $name, false);
        }
        $node = LibraryNode::create(['parent_id' => $parent?->id, 'type' => LibraryNode::FOLDER, 'name' => $name, 'owner_id' => $request->user()->id]);

        return response()->json(['message' => 'Đã tạo thư mục.', 'data' => $this->serialize($node->load('owner:id,name'), $this->access($request))], 201);
    }

    public function upload(Request $request): JsonResponse
    {
        $access = $this->access($request);
        $request->validate([
            'folder_id' => ['nullable', 'integer', 'exists:library_nodes,id'],
            'files' => ['required', 'array', 'max:20'],
            'files.*' => ['file', 'max:20480', 'mimes:'.self::MIMES],
        ], ['files.*.mimes' => 'Định dạng file không được hỗ trợ.', 'files.*.max' => 'Mỗi file tối đa 20MB.']);
        $folder = $this->targetFolder($request->input('folder_id'));
        abort_unless($access->can($folder, LibraryAccess::UPLOAD), 403, 'Bạn không có quyền tải file vào đây.');
        $resolutions = (array) $request->input('resolutions', []);
        $uploads = collect($request->file('files'))->values();
        $conflicts = $uploads->map(fn ($uploaded, $i) => [$i, $uploaded->getClientOriginalName(), LibraryNames::existing($folder?->id, $uploaded->getClientOriginalName())])
            ->filter(fn ($row) => $row[2] && ! in_array($resolutions[$row[0]] ?? null, ['keep', 'replace', 'skip'], true))
            ->map(fn ($row) => ['index' => $row[0], ...$this->conflictInfo($row[2], $row[1], $folder?->id, true, $access)])->values();
        if ($conflicts->isNotEmpty()) {
            return response()->json(['message' => 'Một số file đã tồn tại trong thư mục này.', 'conflicts' => $conflicts], 409);
        }
        $counts = ['added' => 0, 'replaced' => 0, 'skipped' => 0];
        $released = [];
        DB::transaction(function () use ($uploads, $resolutions, $folder, $request, $access, &$counts, &$released) {
            foreach ($uploads as $i => $uploaded) {
                $name = $uploaded->getClientOriginalName();
                $existing = LibraryNames::existing($folder?->id, $name);
                $resolution = $existing ? ($resolutions[$i] ?? 'keep') : null;
                if ($resolution === 'skip') {
                    $counts['skipped']++;

                    continue;
                }
                if ($resolution === 'replace') {
                    abort_unless(! $existing->isFolder() && $access->can($existing, LibraryAccess::EDIT), 403, "Bạn không có quyền thay thế “{$name}”.");
                    $released[] = $existing->file_id;
                    $existing->update(['file_id' => $this->store->store($uploaded, 'library', $request->user())->id]);
                    $existing->touch();
                    $counts['replaced']++;

                    continue;
                }
                $file = $this->store->store($uploaded, 'library', $request->user());
                LibraryNode::create(['parent_id' => $folder?->id, 'type' => LibraryNode::FILE, 'name' => $existing ? LibraryNames::available($folder?->id, $name, true) : $name, 'file_id' => $file->id, 'owner_id' => $request->user()->id]);
                $counts['added']++;
            }
        });
        collect($released)->each(fn ($id) => $this->store->releaseIfUnused($id));

        return response()->json(['message' => $this->summary($counts), 'counts' => $counts], 201);
    }

    public function update(Request $request, LibraryNode $node): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->can($node, LibraryAccess::EDIT), 403, 'Bạn không có quyền sửa mục này.');
        $data = $request->validate(['name' => ['sometimes', 'required', 'string', 'max:255'], 'description' => ['sometimes', 'nullable', 'string']]);
        if (array_key_exists('name', $data)) {
            abort_if($node->is_system && trim($data['name']) !== $node->name, 422, 'Không thể đổi tên thư mục hệ thống.');
            $data['name'] = trim($data['name']);
            if (LibraryNames::existing($node->parent_id, $data['name'], $node->id)) {
                return $this->nameTaken($node->parent_id, $data['name'], ! $node->isFolder(), $node->id);
            }
        }
        $node->update($data);

        return response()->json(['message' => 'Đã cập nhật.', 'data' => $this->serialize($node->fresh(['owner:id,name', 'file']), $access)]);
    }

    public function destroy(Request $request, LibraryNode $node): JsonResponse
    {
        abort_unless($this->access($request)->canDelete($node), 403, 'Bạn không có quyền xóa mục này.');
        abort_if($node->isFolder() && $node->children()->exists(), 422, 'Chỉ có thể xóa thư mục trống.');
        $fileId = $node->file_id;
        DB::transaction(fn () => $node->delete());
        $this->store->releaseIfUnused($fileId);

        return response()->json(['message' => $node->isFolder() ? 'Đã xóa thư mục.' : 'Đã xóa file.']);
    }

    public function paste(Request $request): JsonResponse
    {
        $access = $this->access($request);
        $data = $request->validate([
            'node_id' => ['required', 'integer', 'exists:library_nodes,id'],
            'target_folder_id' => ['nullable', 'integer', 'exists:library_nodes,id'],
            'action' => ['required', Rule::in(['copy', 'cut'])],
            'resolution' => ['nullable', Rule::in(['keep', 'replace', 'skip'])],
        ]);
        $node = LibraryNode::findOrFail($data['node_id']);
        $target = $this->targetFolder($data['target_folder_id'] ?? null);
        abort_unless($access->can($target, LibraryAccess::UPLOAD), 403, 'Bạn không có quyền đặt mục vào thư mục này.');
        abort_if($target && $node->isFolder() && $access->isDescendantOrSelf($target->id, $node->id), 422, 'Không thể đặt thư mục vào bên trong chính nó.');

        $cut = $data['action'] === 'cut';
        abort_unless($cut ? $access->can($node, LibraryAccess::EDIT) && ! $node->is_system : $access->can($node, LibraryAccess::READ), 403, $cut ? 'Bạn không có quyền di chuyển mục này.' : 'Bạn không có quyền sao chép mục này.');
        $isFile = ! $node->isFolder();
        if ($cut && $node->parent_id === $target?->id) {
            return response()->json(['message' => 'Mục đã nằm trong thư mục này.']);
        }
        if (! $cut && $node->parent_id === $target?->id) {
            DB::transaction(fn () => $this->copyNode($node, $target?->id, $request->user()->id, LibraryNames::copyName($target?->id, $node->name, $isFile)));

            return response()->json(['message' => 'Đã tạo bản sao.']);
        }
        $existing = LibraryNames::existing($target?->id, $node->name, $node->id);
        $resolution = $data['resolution'] ?? null;
        if ($existing && ! $resolution) {
            return response()->json(['message' => "“{$node->name}” đã tồn tại trong thư mục đích.", 'conflict' => $this->conflictInfo($existing, $node->name, $target?->id, $isFile, $access)], 409);
        }
        if ($existing && $resolution === 'skip') {
            return response()->json(['message' => 'Đã bỏ qua.']);
        }
        if ($existing && $resolution === 'replace') {
            abort_unless($isFile && ! $existing->isFolder() && $access->can($existing, LibraryAccess::EDIT), 403, 'Không thể thay thế mục này.');
            $old = $existing->file_id;
            DB::transaction(function () use ($existing, $node, $cut) {
                $existing->update(['file_id' => $node->file_id]);
                $existing->touch();
                if ($cut) {
                    $node->delete();
                }
            });
            $this->store->releaseIfUnused($old);

            return response()->json(['message' => 'Đã thay thế.']);
        }
        $name = $existing ? LibraryNames::available($target?->id, $node->name, $isFile, $node->id) : $node->name;
        if ($cut) {
            $node->update(['parent_id' => $target?->id, 'name' => $name]);

            return response()->json(['message' => 'Đã di chuyển.']);
        }
        DB::transaction(fn () => $this->copyNode($node, $target?->id, $request->user()->id, $name));

        return response()->json(['message' => 'Đã sao chép.']);
    }

    public function download(Request $request, LibraryNode $node)
    {
        abort_unless($this->access($request)->can($node, LibraryAccess::READ), 403, 'Bạn không có quyền xem file này.');

        return $this->streamNode($node);
    }

    public function shares(Request $request, LibraryNode $node): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->can($node, LibraryAccess::EDIT), 403, 'Bạn không có quyền chia sẻ mục này.');
        $chain = $access->chain($node->id);
        $rows = LibraryShare::with(['user:id,name,avatar_path', 'department:id,name', 'node:id,name'])->whereIn('node_id', $chain)->get();

        return response()->json([
            'data' => $rows->where('node_id', $node->id)->map(fn ($s) => $this->serializeShare($s))->values(),
            'inherited' => $rows->where('node_id', '!=', $node->id)->map(fn ($s) => [...$this->serializeShare($s), 'from' => $s->node?->name])->values(),
            'can_share_everyone' => $access->manages(),
        ]);
    }

    public function updateShares(Request $request, LibraryNode $node): JsonResponse
    {
        $access = $this->access($request);
        abort_unless($access->can($node, LibraryAccess::EDIT), 403, 'Bạn không có quyền chia sẻ mục này.');
        $data = $request->validate([
            'shares' => ['present', 'array'],
            'shares.*.user_id' => ['nullable', 'integer', 'exists:users,id'],
            'shares.*.department_id' => ['nullable', 'integer', 'exists:departments,id'],
            'shares.*.access' => ['required', Rule::in(array_keys(LibraryShare::LEVELS))],
        ]);
        $rows = collect($data['shares'])->map(fn ($row) => ['user_id' => $row['user_id'] ?? null, 'department_id' => isset($row['user_id']) ? null : ($row['department_id'] ?? null), 'access' => $row['access']])
            ->unique(fn ($row) => ($row['user_id'] ? 'u'.$row['user_id'] : '').($row['department_id'] ? 'd'.$row['department_id'] : '').(! $row['user_id'] && ! $row['department_id'] ? 'all' : ''));
        $everyone = $rows->first(fn ($row) => ! $row['user_id'] && ! $row['department_id']);
        $existingEveryone = $node->shares()->whereNull('user_id')->whereNull('department_id')->first();
        abort_if(! $access->manages() && (($everyone && (! $existingEveryone || $existingEveryone->access !== $everyone['access'])) || (! $everyone && $existingEveryone)), 403, 'Chỉ quản trị kho mới chia sẻ cho toàn trường.');

        DB::transaction(function () use ($node, $rows, $request) {
            $node->shares()->delete();
            $rows->each(fn ($row) => $node->shares()->create([...$row, 'granted_by' => $request->user()->id]));
        });

        return response()->json(['message' => 'Đã cập nhật chia sẻ.']);
    }

    public function shareOptions(Request $request): JsonResponse
    {
        $avatar = fn (?User $u) => $u?->avatar_path ? route('avatars.show', ['filename' => basename($u->avatar_path)]) : null;
        $activeRoles = fn ($q) => $q->where(fn ($r) => $r->whereNull('role_user.expires_at')->orWhere('role_user.expires_at', '>', now()));

        return response()->json([
            'people' => User::with(['roles' => $activeRoles, 'teacher.departments' => fn ($q) => $q->wherePivotNull('ends_on')])->where('status', 'active')->orderBy('name')->get()->map(fn (User $u) => [
                'id' => $u->id, 'name' => $u->name, 'code' => $u->teacher?->employee_code, 'avatar_url' => $avatar($u),
                'department_ids' => $u->teacher?->unitIds() ?? [],
                'roles' => $u->roles->map(fn ($role) => ['code' => $role->code, 'name' => $role->name, 'department_id' => $role->pivot->department_id])->values(),
            ]),
            'units' => Department::ordered()->map(fn ($unit) => ['id' => $unit['id'], 'name' => $unit['label'], 'short_name' => $unit['name'], 'parent_id' => $unit['parent_id'], 'type' => $unit['type']])->values(),
        ]);
    }

    public function targets(Request $request): JsonResponse
    {
        $access = $this->access($request);
        $folders = LibraryNode::where('type', LibraryNode::FOLDER)->orderByDesc('is_system')->orderBy('name')->get(['id', 'parent_id', 'name', 'is_system']);
        $names = $folders->pluck('name', 'id');
        $parents = $folders->pluck('parent_id', 'id');
        $path = function ($id) use ($names, $parents) {
            $parts = [];
            while ($id) {
                array_unshift($parts, $names[$id] ?? '');
                $id = $parents[$id] ?? null;
            }

            return implode(' › ', $parts);
        };

        $ids = $access->accessibleIds();
        $visible = $folders->filter(fn ($f) => $ids === null || $f->is_system || in_array($f->id, $ids, true));
        $visibleIds = $visible->pluck('id')->all();

        return response()->json([
            'root' => $access->canWriteRoot(),
            'folders' => $visible->map(fn ($f) => [
                'id' => $f->id, 'parent_id' => in_array($f->parent_id, $visibleIds, true) ? $f->parent_id : null,
                'name' => $f->name, 'path' => $path($f->id), 'is_system' => $f->is_system,
                'can_target' => $f->is_system || $access->can($f->id, LibraryAccess::UPLOAD),
            ])->values(),
        ]);
    }

    public function myFiles(Request $request): JsonResponse
    {
        $user = $request->user();
        $search = trim($request->string('search')->toString());
        $paginator = DB::table('file_attachments')->join('files', 'files.id', '=', 'file_attachments.file_id')
            ->where('files.uploaded_by', $user->id)->whereIn('attachable_type', [Task::class, TaskSubmission::class])
            ->when($search !== '', fn ($q) => $q->where('files.original_name', 'like', "%{$search}%"))
            ->orderByDesc('files.created_at')->orderByDesc('files.id')
            ->select('files.id', 'files.original_name', 'files.size', 'files.mime_type', 'files.created_at', 'file_attachments.attachable_type', 'file_attachments.attachable_id')
            ->paginate(min(max($request->integer('per_page', 20), 5), 100));
        $rows = collect($paginator->items());
        $submissionTasks = TaskSubmission::whereIn('id', $rows->where('attachable_type', TaskSubmission::class)->pluck('attachable_id'))->pluck('task_id', 'id');
        $tasks = Task::withTrashed()->whereIn('id', $rows->where('attachable_type', Task::class)->pluck('attachable_id')->merge($submissionTasks->values()))->get(['id', 'code', 'title', 'status'])->keyBy('id');
        $shared = LibraryNode::whereIn('file_id', $rows->pluck('id'))->get(['id', 'file_id', 'parent_id'])->groupBy('file_id');

        return response()->json([
            'data' => $rows->map(function ($row) use ($submissionTasks, $tasks, $shared) {
                $isSubmission = $row->attachable_type === TaskSubmission::class;
                $task = $tasks->get($isSubmission ? $submissionTasks->get($row->attachable_id) : $row->attachable_id);

                return [
                    'id' => $row->id, 'name' => $row->original_name, 'size' => (int) $row->size, 'mime_type' => $row->mime_type,
                    'created_at' => Carbon::parse($row->created_at)->toIso8601String(),
                    'source' => $isSubmission ? 'submission' : 'attachment',
                    'task' => $task ? ['id' => $task->id, 'code' => $task->code, 'title' => $task->title, 'status' => $task->status] : null,
                    'can_share' => ! $isSubmission || $task?->status === Task::COMPLETED,
                    'shared_count' => $shared->get($row->id)?->count() ?? 0,
                ];
            }),
            'meta' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()],
        ]);
    }

    public function downloadMyFile(Request $request, StoredFile $file)
    {
        abort_unless((int) $file->uploaded_by === $request->user()->id, 403, 'Bạn chỉ mở được file do chính mình tải lên.');
        abort_unless(Storage::disk($file->disk)->exists($file->path), 404, 'File không tồn tại.');

        return Storage::disk($file->disk)->response($file->path, $file->original_name, ['Content-Type' => $file->mime_type ?: 'application/octet-stream'], 'inline');
    }

    public function checkNames(Request $request): JsonResponse
    {
        $access = $this->access($request);
        $data = $request->validate([
            'folder_id' => ['nullable', 'integer', 'exists:library_nodes,id'],
            'names' => ['required', 'array', 'max:50'],
            'names.*' => ['required', 'string', 'max:255'],
            'type' => ['nullable', Rule::in([LibraryNode::FILE, LibraryNode::FOLDER])],
        ]);
        $folder = $this->targetFolder($data['folder_id'] ?? null);
        abort_unless($access->can($folder, LibraryAccess::READ), 403);
        $isFile = ($data['type'] ?? LibraryNode::FILE) === LibraryNode::FILE;

        return response()->json(['data' => collect($data['names'])->map(function ($name, $i) use ($folder, $isFile, $access) {
            $existing = LibraryNames::existing($folder?->id, $name);

            return ['index' => $i, 'name' => $name, 'conflict' => (bool) $existing, ...($existing ? $this->conflictInfo($existing, $name, $folder?->id, $isFile, $access) : ['suggested_name' => $name])];
        })->values()]);
    }

    public function shareFile(Request $request): JsonResponse
    {
        $access = $this->access($request);
        $data = $request->validate([
            'file_id' => ['required', 'integer', 'exists:files,id'],
            'folder_id' => ['nullable', 'integer', 'exists:library_nodes,id'],
            'name' => ['nullable', 'string', 'max:255'],
            'resolution' => ['nullable', Rule::in(['keep', 'replace', 'skip'])],
        ]);
        $file = StoredFile::findOrFail($data['file_id']);
        abort_unless((int) $file->uploaded_by === $request->user()->id || $access->manages(), 403, 'Bạn chỉ chia sẻ được file do chính mình tải lên.');
        $submissionIds = DB::table('file_attachments')->where('file_id', $file->id)->where('attachable_type', TaskSubmission::class)->pluck('attachable_id');
        if ($submissionIds->isNotEmpty()) {
            $done = Task::whereIn('id', TaskSubmission::whereIn('id', $submissionIds)->pluck('task_id'))->where('status', Task::COMPLETED)->exists();
            abort_unless($done, 422, 'Chỉ chia sẻ được file bài nộp khi công việc đã hoàn thành.');
        }
        $folder = $this->targetFolder($data['folder_id'] ?? null);
        abort_unless(($folder?->is_system) || $access->can($folder, LibraryAccess::UPLOAD), 403, 'Bạn không có quyền đặt file vào thư mục này.');
        abort_if(LibraryNode::where('parent_id', $folder?->id)->where('file_id', $file->id)->exists(), 422, 'File này đã có trong thư mục đích.');
        $name = trim($data['name'] ?? '') ?: $file->original_name;
        $existing = LibraryNames::existing($folder?->id, $name);
        $resolution = $data['resolution'] ?? null;
        if ($existing && ! $resolution) {
            return response()->json(['message' => "“{$name}” đã tồn tại trong thư mục đích.", 'conflict' => $this->conflictInfo($existing, $name, $folder?->id, true, $access)], 409);
        }
        if ($existing && $resolution === 'skip') {
            return response()->json(['message' => 'Đã bỏ qua.']);
        }
        if ($existing && $resolution === 'replace') {
            abort_unless(! $existing->isFolder() && $access->can($existing, LibraryAccess::EDIT), 403, 'Bạn không có quyền thay thế file này.');
            $old = $existing->file_id;
            $existing->update(['file_id' => $file->id]);
            $existing->touch();
            $this->store->releaseIfUnused($old);

            return response()->json(['message' => 'Đã thay thế file trong kho dữ liệu.', 'data' => ['id' => $existing->id, 'folder_id' => $existing->parent_id]], 200);
        }
        $node = LibraryNode::create(['parent_id' => $folder?->id, 'type' => LibraryNode::FILE, 'name' => $existing ? LibraryNames::available($folder?->id, $name, true) : $name, 'file_id' => $file->id, 'owner_id' => $request->user()->id]);

        return response()->json(['message' => 'Đã chia sẻ file vào kho dữ liệu.', 'data' => ['id' => $node->id, 'folder_id' => $node->parent_id]], 201);
    }

    public function streamNode(LibraryNode $node)
    {
        $node->loadMissing('file');
        abort_unless($node->file && Storage::disk($node->file->disk)->exists($node->file->path), 404, 'File không tồn tại.');

        return Storage::disk($node->file->disk)->response($node->file->path, $node->name, ['Content-Type' => $node->file->mime_type ?: 'application/octet-stream'], 'inline');
    }

    private function access(Request $request): LibraryAccess
    {
        return $request->attributes->get('library_access') ?? tap(new LibraryAccess($request->user()), fn ($a) => $request->attributes->set('library_access', $a));
    }

    private function targetFolder($id): ?LibraryNode
    {
        if (! $id) {
            return null;
        }
        $folder = LibraryNode::findOrFail($id);
        abort_unless($folder->isFolder(), 422, 'Đích phải là một thư mục.');

        return $folder;
    }

    private function conflictInfo(LibraryNode $existing, string $name, ?int $parentId, bool $isFile, LibraryAccess $access): array
    {
        return [
            'name' => $name, 'existing_id' => $existing->id, 'existing_type' => $existing->type,
            'can_replace' => $isFile && ! $existing->isFolder() && $access->can($existing, LibraryAccess::EDIT),
            'suggested_name' => LibraryNames::available($parentId, $name, $isFile),
        ];
    }

    private function nameTaken(?int $parentId, string $name, bool $isFile, ?int $ignoreId = null): JsonResponse
    {
        return response()->json([
            'message' => "Đã có mục tên “{$name}” trong thư mục này.",
            'errors' => ['name' => ["Đã có mục tên “{$name}” trong thư mục này."]],
            'suggested_name' => LibraryNames::available($parentId, $name, $isFile, $ignoreId),
        ], 409);
    }

    private function summary(array $counts): string
    {
        $parts = array_filter([
            $counts['added'] ? 'tải lên '.$counts['added'].' file' : null,
            $counts['replaced'] ? 'thay thế '.$counts['replaced'].' file' : null,
            $counts['skipped'] ? 'bỏ qua '.$counts['skipped'].' file' : null,
        ]);

        return $parts ? 'Đã '.implode(', ', $parts).'.' : 'Không có file nào được tải lên.';
    }

    private function copyNode(LibraryNode $source, ?int $parentId, int $userId, ?string $name = null): void
    {
        $copy = LibraryNode::create(['parent_id' => $parentId, 'type' => $source->type, 'name' => $name ?? $source->name, 'file_id' => $source->file_id, 'owner_id' => $userId, 'description' => $source->description]);
        if ($source->isFolder()) {
            $source->children()->get()->each(fn (LibraryNode $child) => $this->copyNode($child, $copy->id, $userId));
        }
    }

    private function filterMime($query, string $type): void
    {
        match ($type) {
            'pdf' => $query->where('mime_type', 'application/pdf'),
            'image' => $query->where('mime_type', 'like', 'image/%'),
            'word' => $query->whereIn('mime_type', ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
            'excel' => $query->whereIn('mime_type', ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
            'slide' => $query->whereIn('mime_type', ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']),
            default => null,
        };
    }

    private function breadcrumbs(LibraryNode $folder, LibraryAccess $access): array
    {
        $names = LibraryNode::whereIn('id', $access->chain($folder->id))->pluck('name', 'id');

        return collect(array_reverse($access->chain($folder->id)))
            ->filter(fn ($id) => $access->can($id, LibraryAccess::READ))
            ->map(fn ($id) => ['id' => $id, 'name' => $names[$id] ?? ''])->values()->all();
    }

    private function tree(LibraryAccess $access): Collection
    {
        $ids = $access->accessibleIds();
        $folders = LibraryNode::where('type', LibraryNode::FOLDER)->when($ids !== null, fn ($q) => $q->whereIn('id', $ids ?: [0]))
            ->orderByDesc('is_system')->orderBy('name')->get(['id', 'parent_id', 'name', 'is_system', 'owner_id', 'type']);
        $visible = $folders->pluck('id')->all();

        return $folders->map(function (LibraryNode $f) use ($visible, $access) {
            $level = $access->level($f);

            return [
                'id' => $f->id, 'type' => LibraryNode::FOLDER, 'parent_id' => in_array($f->parent_id, $visible, true) ? $f->parent_id : null, 'name' => $f->name, 'is_system' => $f->is_system,
                'abilities' => [
                    'level' => $level, 'can_upload' => $level >= LibraryAccess::UPLOAD, 'can_edit' => $level >= LibraryAccess::EDIT,
                    'can_rename' => $level >= LibraryAccess::EDIT && ! $f->is_system, 'can_share' => $level >= LibraryAccess::EDIT,
                    'can_delete' => $access->canDelete($f), 'can_move' => $level >= LibraryAccess::EDIT && ! $f->is_system,
                ],
            ];
        })->values();
    }

    private function serializeShare(LibraryShare $share): array
    {
        $kind = $share->user_id ? 'user' : ($share->department_id ? 'unit' : 'everyone');

        return [
            'id' => $share->id, 'kind' => $kind, 'user_id' => $share->user_id, 'department_id' => $share->department_id,
            'name' => match ($kind) { 'user' => $share->user?->name, 'unit' => $share->department_id ? Department::pathLabel($share->department_id) : null, default => 'Mọi người trong trường' },
            'avatar_url' => $share->user?->avatar_path ? route('avatars.show', ['filename' => basename($share->user->avatar_path)]) : null,
            'access' => $share->access,
        ];
    }

    private function serialize(LibraryNode $node, LibraryAccess $access, bool $withPath = false): array
    {
        $level = $access->level($node);
        $shares = $node->relationLoaded('shares') ? $node->shares : collect();

        return [
            'id' => $node->id, 'type' => $node->type, 'name' => $node->name, 'parent_id' => $node->parent_id, 'is_system' => $node->is_system,
            'description' => $node->description,
            'owner' => $node->owner ? ['id' => $node->owner->id, 'name' => $node->owner->name] : null,
            'size' => $node->file?->size, 'mime_type' => $node->file?->mime_type,
            'children_count' => $node->children_count ?? null,
            'created_at' => $node->created_at?->toIso8601String(), 'updated_at' => $node->updated_at?->toIso8601String(),
            'path' => $withPath && $node->parent_id ? $this->breadcrumbs(LibraryNode::find($node->parent_id), $access) : null,
            'shares' => $shares->map(fn ($s) => ['kind' => $s->user_id ? 'user' : ($s->department_id ? 'unit' : 'everyone'), 'name' => $s->user?->name ?? $s->department?->name ?? 'Mọi người', 'access' => $s->access])->values(),
            'abilities' => [
                'level' => $level,
                'can_upload' => $node->isFolder() && $level >= LibraryAccess::UPLOAD,
                'can_edit' => $level >= LibraryAccess::EDIT,
                'can_rename' => $level >= LibraryAccess::EDIT && ! $node->is_system,
                'can_share' => $level >= LibraryAccess::EDIT,
                'can_delete' => $access->canDelete($node),
                'can_move' => $level >= LibraryAccess::EDIT && ! $node->is_system,
            ],
        ];
    }
}
