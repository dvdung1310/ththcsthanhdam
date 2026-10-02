<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DocumentType;
use App\Models\DocumentFolder;
use App\Models\OfficialDocument;
use App\Models\StoredFile;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = OfficialDocument::with(['type', 'file'])->withCount('tasks')
            ->when($request->string('search')->toString(), fn ($q, $search) => $q->where(fn ($b) => $b->where('title', 'like', "%{$search}%")->orWhere('summary', 'like', "%{$search}%")->orWhere('link', 'like', "%{$search}%")))
            ->when($request->string('type')->toString(), fn ($q, $type) => $q->whereHas('type', fn ($t) => $t->where('name', $type)))
            ->when($request->string('direction')->toString(), fn ($q, $direction) => $q->where('direction', $direction))
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->when($request->has('folder_id'), fn ($q) => $request->filled('folder_id') ? $q->where('folder_id', $request->integer('folder_id')) : $q->whereNull('folder_id'))
            ->when($request->string('file_type')->toString(), function ($q, $type) {
                if ($type === 'link') $q->whereNotNull('link');
                elseif ($type === 'none') $q->whereNull('file_id')->whereNull('link');
                elseif ($type === 'pdf') $q->whereHas('file', fn ($file) => $file->where('mime_type', 'application/pdf'));
                elseif ($type === 'image') $q->whereHas('file', fn ($file) => $file->where('mime_type', 'like', 'image/%'));
                elseif ($type === 'word') $q->whereHas('file', fn ($file) => $file->whereIn('mime_type', ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']));
                elseif ($type === 'excel') $q->whereHas('file', fn ($file) => $file->whereIn('mime_type', ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']));
            });
        match ($request->string('sort')->toString()) {
            'oldest' => $query->oldest('created_at'),
            'name_asc' => $query->orderBy('title'),
            'name_desc' => $query->orderByDesc('title'),
            default => $query->latest('created_at'),
        };
        $query->latest('id');
        $perPage = min(max($request->integer('per_page', 10), 5), 100);
        $paginator = $query->paginate($perPage);
        $paginator->getCollection()->transform(fn ($document) => $this->serialize($document));

        return response()->json([
            'data' => $paginator->items(),
            'meta' => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'per_page' => $paginator->perPage(), 'total' => $paginator->total()],
            'stats' => [
                'total' => OfficialDocument::count(),
                'incoming' => OfficialDocument::where('direction', 'incoming')->count(),
                'outgoing' => OfficialDocument::where('direction', 'outgoing')->count(),
                'this_month' => OfficialDocument::whereYear('issued_on', now()->year)->whereMonth('issued_on', now()->month)->count(),
            ],
            'filters' => ['types' => DocumentType::orderBy('name')->pluck('name')],
            'folders' => DocumentFolder::withCount(['documents', 'children'])->orderBy('name')->get(['id', 'parent_id', 'name', 'created_by']),
            'can_see_all' => $request->user()->isPrincipal() || $request->user()->roles()->where('code', 'system_admin')->exists(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validateDocument($request);
        $document = DB::transaction(function () use ($request, $data) {
            $type = $this->resolveType('Văn bản');
            $file = $request->hasFile('file') ? $this->storeFile($request) : null;
            return OfficialDocument::create([...$data, 'document_type_id' => $type->id, 'file_id' => $file?->id, 'created_by' => $request->user()->id, 'document_number' => 'VB-'.Str::upper(Str::random(10)), 'issuer' => 'TH-THCS Thanh Đàm', 'issued_on' => now()->toDateString(), 'direction' => 'internal', 'status' => 'active']);
        });
        return response()->json(['message' => 'Đã thêm văn bản thành công.', 'data' => $this->serialize($document->load(['type', 'file'])->loadCount('tasks'))], 201);
    }

    public function show(OfficialDocument $document): JsonResponse
    {
        return response()->json(['data' => $this->serialize($document->load(['type', 'file'])->loadCount('tasks'))]);
    }

    public function update(Request $request, OfficialDocument $document): JsonResponse
    {
        $data = $this->validateDocument($request, $document);
        DB::transaction(function () use ($request, $data, $document) {
            $fileId = $document->file_id;
            if ($request->hasFile('file')) {
                $oldFile = $document->file;
                $fileId = $this->storeFile($request)->id;
                if ($oldFile) {
                    Storage::disk($oldFile->disk)->delete($oldFile->path);
                    $oldFile->delete();
                }
            }
            $document->update([...$data, 'file_id' => $fileId]);
        });
        return response()->json(['message' => 'Đã cập nhật văn bản thành công.', 'data' => $this->serialize($document->fresh()->load(['type', 'file'])->loadCount('tasks'))]);
    }

    public function destroy(OfficialDocument $document): JsonResponse
    {
        $document->delete();
        return response()->json(['message' => 'Đã xóa văn bản thành công.']);
    }

    public function download(OfficialDocument $document): StreamedResponse|JsonResponse
    {
        if (! $document->file || ! Storage::disk($document->file->disk)->exists($document->file->path)) {
            return response()->json(['message' => 'Văn bản chưa có file hoặc file không tồn tại.'], 404);
        }
        return Storage::disk($document->file->disk)->response(
            $document->file->path,
            $document->file->original_name,
            ['Content-Type' => $document->file->mime_type],
            'inline'
        );
    }

    private function validateDocument(Request $request, ?OfficialDocument $document = null): array
    {
        return $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'summary' => ['nullable', 'string'],
            'link' => ['nullable', 'url:http,https', 'max:2048'],
            'folder_id' => ['nullable', 'integer', 'exists:document_folders,id'],
            'file' => ['nullable', 'file', 'max:20480', 'mimes:pdf,doc,docx,xls,xlsx,jpg,jpeg,png'],
        ]);
    }

    private function resolveType(string $name): DocumentType
    {
        return DocumentType::firstOrCreate(['name' => $name], ['code' => strtoupper(Str::slug($name, '_')).'_'.Str::upper(Str::random(4))]);
    }

    private function storeFile(Request $request): StoredFile
    {
        $uploaded = $request->file('file');
        $path = $uploaded->store('official-documents');
        return StoredFile::create(['uploaded_by' => $this->systemUser()->id, 'disk' => 'local', 'path' => $path, 'original_name' => $uploaded->getClientOriginalName(), 'mime_type' => $uploaded->getMimeType(), 'size' => $uploaded->getSize(), 'checksum' => hash_file('sha256', $uploaded->getRealPath())]);
    }

    private function systemUser(): User
    {
        return User::firstOrCreate(['email' => 'admin@thanhdam.edu.vn'], ['name' => 'Quản trị hệ thống', 'phone' => '0900000000', 'password' => Str::random(40), 'status' => 'active']);
    }

    private function serialize(OfficialDocument $document): array
    {
        return ['id' => $document->id, 'folder_id' => $document->folder_id, 'title' => $document->title, 'summary' => $document->summary, 'link' => $document->link, 'file_name' => $document->file?->original_name, 'file_size' => $document->file?->size, 'download_url' => $document->file ? route('documents.download', $document) : null, 'tasks_count' => $document->tasks_count ?? 0, 'created_at' => $document->created_at?->toIso8601String(), 'updated_at' => $document->updated_at?->toIso8601String()];
    }

    public function storeFolder(Request $request): JsonResponse
    {
        $parentId = $request->integer('parent_id') ?: null;
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150', Rule::unique('document_folders', 'name')->where(fn ($query) => $parentId ? $query->where('parent_id', $parentId) : $query->whereNull('parent_id'))],
            'parent_id' => ['nullable', 'integer', 'exists:document_folders,id'],
        ], ['name.unique' => 'Tên thư mục đã tồn tại tại vị trí này. Vui lòng chọn tên khác.']);
        $folder = DocumentFolder::create([...$data, 'created_by' => $request->user()->id]);
        return response()->json(['message' => 'Đã tạo thư mục.', 'data' => $folder], 201);
    }

    public function updateFolder(Request $request, DocumentFolder $folder): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150', Rule::unique('document_folders', 'name')->ignore($folder->id)->where(fn ($query) => $folder->parent_id ? $query->where('parent_id', $folder->parent_id) : $query->whereNull('parent_id'))],
        ], ['name.unique' => 'Tên thư mục đã tồn tại tại vị trí này. Vui lòng chọn tên khác.']);
        $folder->update($data);
        return response()->json(['message' => 'Đã đổi tên thư mục.', 'data' => $folder]);
    }

    public function destroyFolder(DocumentFolder $folder): JsonResponse
    {
        abort_if($folder->children()->exists() || $folder->documents()->exists(), 422, 'Chỉ có thể xóa thư mục trống.');
        $folder->delete();
        return response()->json(['message' => 'Đã xóa thư mục.']);
    }

    public function paste(Request $request): JsonResponse
    {
        $data = $request->validate([
            'item_type' => ['required', 'in:file,folder'],
            'item_id' => ['required', 'integer'],
            'action' => ['required', 'in:copy,cut'],
            'target_folder_id' => ['nullable', 'integer', 'exists:document_folders,id'],
        ]);
        $targetId = $data['target_folder_id'] ?? null;

        if ($data['item_type'] === 'file') {
            $document = OfficialDocument::findOrFail($data['item_id']);
            if ($data['action'] === 'cut') {
                $document->update(['folder_id' => $targetId]);
            } else {
                $copy = $document->replicate();
                $copy->title = $document->title.' - Bản sao';
                $copy->document_number = 'VB-'.Str::upper(Str::random(10));
                $copy->folder_id = $targetId;
                $copy->created_by = $request->user()->id;
                $copy->save();
            }
        } else {
            $folder = DocumentFolder::findOrFail($data['item_id']);
            abort_if($folder->id === $targetId || $this->isDescendant($targetId, $folder->id), 422, 'Không thể đặt thư mục vào bên trong chính nó.');
            if ($data['action'] === 'cut') {
                $folder->update(['parent_id' => $targetId]);
            } else {
                $this->copyFolder($folder, $targetId, $request->user()->id, true);
            }
        }

        return response()->json(['message' => $data['action'] === 'cut' ? 'Đã di chuyển mục.' : 'Đã sao chép mục.']);
    }

    private function isDescendant(?int $candidateId, int $folderId): bool
    {
        while ($candidateId) {
            if ($candidateId === $folderId) return true;
            $candidateId = DocumentFolder::whereKey($candidateId)->value('parent_id');
        }
        return false;
    }

    private function copyFolder(DocumentFolder $source, ?int $parentId, int $userId, bool $root = false): DocumentFolder
    {
        $baseName = $source->name.($root ? ' - Bản sao' : '');
        $name = $baseName;
        $index = 2;
        while (DocumentFolder::where('parent_id', $parentId)->where('name', $name)->exists()) $name = $baseName.' ('.$index++.')';
        $copy = DocumentFolder::create(['parent_id' => $parentId, 'created_by' => $userId, 'name' => $name]);
        $source->documents()->get()->each(function (OfficialDocument $document) use ($copy, $userId) {
            $documentCopy = $document->replicate();
            $documentCopy->folder_id = $copy->id;
            $documentCopy->created_by = $userId;
            $documentCopy->document_number = 'VB-'.Str::upper(Str::random(10));
            $documentCopy->save();
        });
        $source->children()->get()->each(fn (DocumentFolder $child) => $this->copyFolder($child, $copy->id, $userId));
        return $copy;
    }
}
