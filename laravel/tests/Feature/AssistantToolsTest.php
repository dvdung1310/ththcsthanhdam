<?php

namespace Tests\Feature;

use App\Models\AiConversation;
use App\Models\AiMessage;
use App\Models\Employee;
use App\Models\Evaluation;
use App\Models\EvaluationPeriod;
use App\Models\LibraryNode;
use App\Models\Permission;
use App\Models\Task;
use App\Models\User;
use App\Services\AssistantTools;
use App\Services\EvaluationScoring;
use App\Services\LibraryAccess;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// Runs against the MySQL demo database: DB_CONNECTION=mysql DB_DATABASE=thanhdam_test php artisan test --filter=AssistantToolsTest
class AssistantToolsTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        if (DB::getDriverName() !== 'mysql' || ! User::where('email', 'thao.dt@thanhdam.edu.vn')->exists()) {
            $this->markTestSkipped('Needs the MySQL demo database (thanhdam_test).');
        }
    }

    public function test_every_tool_definition_is_strict(): void
    {
        foreach (AssistantTools::definitions() as $tool) {
            $properties = array_keys((array) $tool['parameters']['properties']);
            $this->assertTrue($tool['strict']);
            $this->assertFalse($tool['parameters']['additionalProperties']);
            $this->assertSame($properties, $tool['parameters']['required'], $tool['name']);
        }
    }

    public function test_unknown_tools_are_rejected(): void
    {
        $this->assertArrayHasKey('error', $this->tools('mai.nt')->run('delete_tasks', []));
    }

    public function test_teacher_only_sees_tasks_visible_on_the_task_page(): void
    {
        $teacher = $this->user('thao.dt');
        $visible = Task::query()->visibleTo($teacher)->pluck('code');
        $result = $this->tools('thao.dt')->run('search_tasks', $this->taskArgs());

        $this->assertSame($visible->count(), $result['total']);
        $this->assertEmpty(collect($result['tasks'])->pluck('code')->diff($visible));
        $this->assertGreaterThan($result['total'], $this->tools('mai.nt')->run('search_tasks', $this->taskArgs())['total']);
    }

    public function test_teacher_cannot_open_a_task_outside_their_scope(): void
    {
        $hidden = Task::whereNotIn('id', Task::query()->visibleTo($this->user('thao.dt'))->select('tasks.id'))->firstOrFail();

        $this->assertArrayHasKey('error', $this->tools('thao.dt')->run('task_detail', ['code' => $hidden->code]));
        $this->assertSame($hidden->code, $this->tools('mai.nt')->run('task_detail', ['code' => $hidden->code])['code']);
    }

    public function test_task_detail_returns_plain_description(): void
    {
        $task = Task::whereNotNull('description')->where('description', 'like', '%<%')->firstOrFail();
        $detail = $this->tools('mai.nt')->run('task_detail', ['code' => $task->code]);

        $this->assertNotEmpty($detail['description']);
        $this->assertStringNotContainsString('<', $detail['description']);
    }

    public function test_personnel_tools_follow_personnel_permission_and_unit_scope(): void
    {
        $teacher = $this->user('thao.dt');
        if (! $teacher->hasPermission('personnel.view')) {
            $this->assertArrayHasKey('error', $this->tools('thao.dt')->run('search_people', $this->peopleArgs()));
            $this->assertArrayHasKey('error', $this->tools('thao.dt')->run('unit_overview', ['unit' => null]));
        }

        $leader = $this->user('nam.tv');
        $allowed = Employee::inUnits($leader->managedUnitIds())->with('user')->get()->pluck('user.name');
        $people = collect($this->tools('nam.tv')->run('search_people', $this->peopleArgs())['people'])->pluck('name');
        $this->assertNotEmpty($people);
        $this->assertEmpty($people->diff($allowed));
    }

    public function test_people_search_never_returns_contact_or_identity_fields(): void
    {
        $person = $this->tools('mai.nt')->run('search_people', $this->peopleArgs())['people'][0];

        foreach (['email', 'phone', 'identity_number', 'address', 'date_of_birth', 'notes'] as $field) {
            $this->assertArrayNotHasKey($field, $person);
        }
    }

    public function test_workload_without_stats_permission_is_limited_to_self(): void
    {
        $teacher = $this->user('thao.dt');
        $this->assertFalse($teacher->hasPermission('kpi.view'));
        $people = collect($this->tools('thao.dt')->run('people_workload', ['person' => null, 'unit' => null])['people']);

        $this->assertSame([$teacher->name], $people->pluck('name')->all());
    }

    public function test_teacher_sees_only_their_own_sheet_and_no_final_score_while_period_is_open(): void
    {
        $period = EvaluationPeriod::where('status', EvaluationPeriod::OPEN)->orderByDesc('year')->orderByDesc('month')->firstOrFail();
        $month = sprintf('%04d-%02d', $period->year, $period->month);
        $teacher = $this->user('thao.dt');
        $result = $this->tools('thao.dt')->run('evaluation_scores', ['month' => $month, 'person' => null, 'unit' => null, 'grade' => null]);

        $own = Evaluation::where('period_id', $period->id)->where('teacher_id', $teacher->employee->id)->first();
        $this->assertSame($own ? 1 : 0, $result['total']);
        foreach ($result['sheets'] as $sheet) {
            $this->assertSame($teacher->name, $sheet['name']);
            $this->assertNull($sheet['final_total']);
            $this->assertNull($sheet['grade']);
        }
        $this->assertGreaterThan(1, $this->tools('mai.nt')->run('evaluation_scores', ['month' => $month, 'person' => null, 'unit' => null, 'grade' => null])['total']);
    }

    public function test_library_search_only_lists_readable_nodes(): void
    {
        $teacher = $this->user('thao.dt');
        $readable = (new LibraryAccess($teacher))->scopeReadable(LibraryNode::query())->pluck('name');
        $items = collect($this->tools('thao.dt')->run('search_library', ['query' => '', 'type' => null])['items'])->pluck('name');

        $this->assertNotEmpty($items);
        $this->assertEmpty($items->diff($readable));
        $this->assertLessThan(LibraryNode::count(), $readable->count());
    }

    public function test_leave_without_leave_permission_is_limited_to_self(): void
    {
        $teacher = $this->user('thao.dt');
        $this->assertFalse($teacher->hasPermission('leave.view') || $teacher->hasPermission('leave.manage'));
        $records = collect($this->tools('thao.dt')->run('leave_summary', ['from' => '2025-08-01', 'to' => '2027-07-31', 'person' => null])['records']);

        $this->assertEmpty($records->pluck('name')->reject(fn ($name) => $name === $teacher->name));
    }

    public function test_ask_runs_requested_tools_and_returns_the_final_answer(): void
    {
        config(['services.openai.key' => 'test-key']);
        Http::fake(['api.openai.com/*' => Http::sequence()
            ->push(['output' => [['type' => 'function_call', 'call_id' => 'call_1', 'name' => 'school_snapshot', 'arguments' => '{}']]])
            ->push(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => 'Có 13 việc quá hạn.']]]]])]);
        $response = $this->withToken($this->token('mai.nt'))->postJson('/api/ai-assistant/ask', ['question' => 'Có bao nhiêu việc quá hạn?'])
            ->assertOk()->assertJson(['answer' => 'Có 13 việc quá hạn.', 'conversation' => ['title' => 'Có bao nhiêu việc quá hạn?']]);
        $conversation = AiConversation::findOrFail($response->json('conversation.id'));
        $this->assertSame($this->user('mai.nt')->id, $conversation->user_id);
        $this->assertSame([AiMessage::USER, AiMessage::ASSISTANT], $conversation->messages()->pluck('role')->all());

        $requests = Http::recorded()->map(fn ($pair) => $pair[0]->data());
        $this->assertCount(2, $requests);
        $this->assertFalse($requests[0]['store']);
        $output = collect($requests[1]['input'])->firstWhere('type', 'function_call_output');
        $this->assertSame('call_1', $output['call_id']);
        $this->assertSame('toàn trường', json_decode($output['output'], true)['scope']);
    }

    public function test_follow_up_questions_reuse_the_saved_conversation_as_context(): void
    {
        config(['services.openai.key' => 'test-key']);
        $conversation = AiConversation::create(['user_id' => $this->user('mai.nt')->id, 'title' => 'Cũ', 'last_message_at' => now()]);
        foreach (range(1, 15) as $turn) {
            $conversation->messages()->createMany([['role' => AiMessage::USER, 'content' => "Câu hỏi {$turn}"], ['role' => AiMessage::ASSISTANT, 'content' => str_repeat("Trả lời {$turn} ", 200)]]);
        }
        Http::fake(['api.openai.com/*' => Http::response(['output' => [['type' => 'message', 'content' => [['type' => 'output_text', 'text' => 'Đáp']]]]])]);

        $this->withToken($this->token('mai.nt'))->postJson('/api/ai-assistant/ask', ['question' => 'Còn tổ kia?', 'conversation_id' => $conversation->id])
            ->assertOk()->assertJsonPath('conversation.id', $conversation->id);

        $input = collect(Http::recorded()->first()[0]->data()['input']);
        $history = $input->slice(0, -1);
        $this->assertSame('Còn tổ kia?', $input->last()['content']);
        $this->assertLessThanOrEqual(20, $history->count());
        $this->assertLessThanOrEqual(12000 + 1500, $history->sum(fn ($message) => mb_strlen($message['content'])));
        $this->assertTrue($history->where('role', 'assistant')->every(fn ($message) => mb_strlen($message['content']) <= 1503));
        $this->assertStringContainsString('Trả lời 15', $history->last()['content']);
        $this->assertSame(32, $conversation->messages()->count());
    }

    public function test_conversations_are_private_to_their_owner(): void
    {
        $conversation = AiConversation::create(['user_id' => $this->user('mai.nt')->id, 'title' => 'Riêng tư', 'last_message_at' => now()]);
        $this->user('khai.dq')->roles()->first()->permissions()->syncWithoutDetaching([Permission::where('code', 'ai.assistant')->value('id')]);
        $token = $this->token('khai.dq');

        $this->withToken($token)->getJson("/api/ai-assistant/conversations/{$conversation->id}")->assertNotFound();
        $this->withToken($token)->patchJson("/api/ai-assistant/conversations/{$conversation->id}", ['title' => 'x'])->assertNotFound();
        $this->withToken($token)->deleteJson("/api/ai-assistant/conversations/{$conversation->id}")->assertNotFound();
        $this->withToken($token)->postJson('/api/ai-assistant/ask', ['question' => 'Hi', 'conversation_id' => $conversation->id])->assertNotFound();
        $this->assertNotContains($conversation->id, $this->withToken($token)->getJson('/api/ai-assistant/conversations')->json('data.*.id'));

        $owner = $this->token('mai.nt');
        $this->withToken($owner)->patchJson("/api/ai-assistant/conversations/{$conversation->id}", ['title' => 'Đổi tên'])->assertOk()->assertJsonPath('conversation.title', 'Đổi tên');
        $this->withToken($owner)->deleteJson("/api/ai-assistant/conversations/{$conversation->id}")->assertOk();
        $this->assertDatabaseMissing('ai_conversations', ['id' => $conversation->id]);
    }

    public function test_failed_questions_are_not_saved(): void
    {
        config(['services.openai.key' => 'test-key']);
        Http::fake(['api.openai.com/*' => Http::response(['error' => 'boom'], 500)]);
        $before = AiConversation::count();

        $this->withToken($this->token('mai.nt'))->postJson('/api/ai-assistant/ask', ['question' => 'Lỗi?'])->assertStatus(502);
        $this->assertSame($before, AiConversation::count());
    }

    private function token(string $login): string
    {
        return $this->postJson('/api/auth/login', ['email' => "{$login}@thanhdam.edu.vn", 'password' => 'Teacher@123'])->json('token');
    }

    private function user(string $login): User
    {
        return User::where('email', "{$login}@thanhdam.edu.vn")->firstOrFail();
    }

    private function tools(string $login): AssistantTools
    {
        return new AssistantTools($this->user($login), app(EvaluationScoring::class));
    }

    private function taskArgs(): array
    {
        return ['search' => null, 'status' => null, 'overdue' => null, 'unit' => null, 'person' => null, 'due_within_days' => null];
    }

    private function peopleArgs(): array
    {
        return ['search' => null, 'unit' => null, 'role' => null, 'status' => null];
    }
}
