<?php

namespace Database\Seeders;

use App\Models\EvaluationCriterion;
use App\Models\EvaluationTemplate;
use Illuminate\Database\Seeder;

class EvaluationTemplateSeeder extends Seeder
{
    public const SCHOOL_YEAR = '2026-2027';

    private const GRADES = [
        ['code' => 'xuat_sac', 'name' => 'Xuất sắc', 'homeroom_min' => 100, 'regular_min' => 80, 'clean_required' => true, 'condition' => 'Không vi phạm QCCM, Đạo đức nhà giáo. Hoàn thành xuất sắc công việc.'],
        ['code' => 'a', 'name' => 'Loại A (Tốt)', 'homeroom_min' => 95, 'regular_min' => 75, 'clean_required' => true, 'condition' => 'Không vi phạm QCCM, Đạo đức nhà giáo.'],
        ['code' => 'b', 'name' => 'Loại B (Khá)', 'homeroom_min' => 85, 'regular_min' => 65, 'clean_required' => true, 'condition' => 'Không vi phạm QCCM, Đạo đức nhà giáo.'],
        ['code' => 'c', 'name' => 'Loại C (Trung bình)', 'homeroom_min' => 65, 'regular_min' => 50, 'clean_required' => false, 'condition' => 'Nhắc nhở chuyên môn hoặc mắc lỗi hành chính đã khắc phục.'],
    ];

    private const SECTIONS = [
        ['I', 'Nền nếp, tác phong', 10, false, [
            ['1', 'Ngày, giờ công', 8, "Đi làm đầy đủ; có mặt, bắt đầu và kết thúc công việc đúng thời gian; tham gia đầy đủ các cuộc họp, sinh hoạt và hoạt động tập thể được triệu tập.\nĐi muộn, về sớm, họp muộn dưới 30 phút: trừ 0,5đ/lần.\nĐi muộn/về sớm từ 30 phút trở lên hoặc vắng 01 buổi họp không có lý do chính đáng: trừ 1đ/lần.\nNghỉ về việc riêng, có phép và được sự đồng ý của BGH: trừ 1đ/buổi.\nNghỉ không phép, bỏ vị trí/ca trực hoặc tự ý đổi lịch không báo người có thẩm quyền: trừ 8đ/lần; trường hợp nghiêm trọng xem xét theo quy định sau khi có kết luận.\nNghỉ chế độ thai sản; hiếu hỉ của bản thân, bố mẹ, con (được nghỉ 3 ngày); nghỉ giỗ tứ thân phụ mẫu (được nghỉ 1 ngày) không trừ điểm, nhưng không tính ngày công cao.\nNghỉ trên 8 ngày (hay 16 buổi) trong một năm học sẽ không xếp loại thi đua đợt IV.\nNghỉ từ 3 ngày/đợt hoặc 12 ngày/năm: HĐTĐ xem xét theo chất lượng và hiệu quả công việc để xét thi đua đợt và năm học sau đó ra quyết định.\nTrường hợp nghỉ được phân công dạy thay không đúng chuyên môn thì GV phải lên lịch dạy bù trình BGH phê duyệt."],
            ['2', 'Trang phục, đồng phục và tác phong', 2, "Trang phục lịch sự, gọn gàng, đeo thẻ tên phù hợp văn hóa công sở; thực hiện âu phục (hoặc áo trắng) vào thứ Hai hằng tuần và lễ phục/đồng phục trường trong các ngày lễ theo quy định; giao tiếp chuẩn mực.\nKhông thực hiện đúng âu phục (hoặc áo trắng) vào thứ Hai: trừ 0,5đ/lần.\nKhông mặc lễ phục/đồng phục trường vào ngày khai giảng, 20/11 hoặc tổng kết: trừ 0,5đ/lần.\nTrang phục không bảo đảm văn hóa công sở, tác phong thiếu nghiêm túc: trừ 1đ/lần.\nHành vi, lời nói thiếu chuẩn mực đã được nhắc nhở mà tái phạm: trừ 2đ; trường hợp có dấu hiệu vi phạm thì xem xét theo quy trình riêng."],
        ]],
        ['II', 'Hồ sơ sổ sách', 10, false, [
            ['1', 'Kế hoạch bài dạy (KHBD)', 2.5, "Chung: Đầy đủ KHBD theo KHDH đúng về số tiết theo chương trình, rõ hoạt động và thể hiện triển khai tích hợp tiếng Anh trong các tiêu đề của KHBD; từng bước ứng dụng học liệu số và công nghệ trong dạy học, nộp đúng hạn.\nĐối với các lớp tham gia lộ trình thí điểm đưa tiếng Anh là ngôn ngữ thứ hai (mức 1 - khởi đầu), KHBD phải thể hiện việc tích hợp tiếng Anh trong các tiêu đề bài học, sử dụng các khẩu lệnh tiếng Anh cơ bản (Classroom English) trong tổ chức lớp học, khởi động hoặc trò chơi. Việc tích hợp phải tự nhiên, không gây quá tải và không làm sai lệch kiến thức môn học.\nTiểu học: chú trọng tích hợp, phát triển năng lực, học liệu số. THCS: đúng cấu trúc bài dạy, phát triển kỹ năng.\nLên lớp không có KHBD: không xếp loại tháng.\nSoạn không đúng quy định: trừ 1đ."],
            ['2', 'Sổ điểm và đánh giá học sinh', 2.5, "Cấp THCS: vào sổ điểm điện tử, chấm trả bài, vào điểm cá nhân đúng tiến độ theo Thông tư 22/2021.\nCấp Tiểu học: cập nhật nhận xét, đánh giá thường xuyên/định kỳ trên phần mềm CSDL theo Thông tư 27/2020.\nVào điểm/nhận xét muộn: trừ 1đ/lần; sửa điểm sai quy định: trừ 0,5đ/lỗi; nhập sai điểm/nhận xét sai thực tế: trừ 2,5đ/lỗi; sai quy trình: hạ 1 bậc thi đua."],
            ['3', 'Sổ tổ, biên bản họp CM và phiếu thi đua', 2.5, "Ghi chép sinh hoạt nhóm/tổ CM đầy đủ, chi tiết, nộp sổ tổ đúng thời hạn.\nThống kê kết quả bài KTTX, KTĐK đúng thực tế, đúng hạn.\nHoàn thành phiếu tự đánh giá thi đua đúng thời gian.\nThiếu nội dung SHCM tổ/nhóm: trừ 1đ/lần; thống kê sai thực tế: trừ 2đ/lần; nộp muộn phiếu/kết quả: trừ 1đ/lần."],
            ['4', 'Sổ ghi đầu bài / sổ giao nhận HS', 2.5, "Khối THCS: GVBM yêu cầu HS ghi đầy đủ, ký sổ từng tiết. GVCN kiểm tra, nhận xét hàng tuần. Đảm bảo số TT, nội dung tiết học trùng khớp với LBG và KHBD.\nKhối Tiểu học: GV dạy cập nhật sổ giao nhận HS đầy đủ. GVCN xác nhận.\nBỏ ký sổ đầu bài/sổ giao nhận HS: trừ 2đ/tiết; lịch báo giảng và sổ đầu bài không khớp: trừ 1đ/lỗi; GVCN không kiểm tra/nhận xét tuần: trừ 1đ/lần.\nGV dạy thay/quản giờ nếu không ký: đánh giá GV quản giờ/dạy thay."],
        ]],
        ['III', 'Chuyên môn', 45, false, [
            ['1', 'Tổ chức dạy học và kiểm tra đánh giá', 15, "Đảm bảo dạy học phát triển năng lực; ra đề/ma trận kiểm tra đúng chuẩn kiến thức, định dạng đổi mới theo HDCM: 5 điểm.\nPhát hiện, phân loại đối tượng HS, có biện pháp bồi dưỡng kịp thời nâng cao năng lực học sinh: 10 điểm. Cá nhân xây dựng các biện pháp giáo dục áp dụng với từng đối tượng HS trình BGH phê duyệt.\nĐề thi sai kiến thức: trừ 4đ/đề.\nRa đề sai ma trận/nộp muộn: trừ 2đ/đề.\nDạy rập khuôn, không chuẩn bị, chưa có ứng dụng hiệu quả CN số… (qua dự giờ của tổ, nhóm CM, BGH): trừ 2đ/lần."],
            ['2', 'Năng lực số và đổi mới sáng tạo', 10, "Ứng dụng hiệu quả công nghệ số, AI, bài giảng E-learning vào thực tế giảng dạy: 5 điểm.\nChủ động thực hiện các chuyên đề, bài dạy minh họa cấp tổ/trường mang lại hiệu quả: 5 điểm.\nKhông thực hiện nhiệm vụ chuyên đề được giao mà không có lý do chính đáng: không xét thi đua tháng.\nDạy chuyên đề không đạt mà không khắc phục: trừ 3đ."],
            ['3', 'Sử dụng đồ dùng, TBDH và CNTT/AI', 5, "Đăng ký mượn/trả TBDH đúng quy định, ký sổ đầy đủ. Tích cực ứng dụng CNTT/AI trong giảng dạy; khuyến khích sử dụng học liệu số, bài giảng điện tử có thiết kế song ngữ (hoặc có chú thích từ vựng tiếng Anh) phục vụ cho các lớp thí điểm.\nKhối THCS: đăng ký trước 1 ngày/đầu tuần. Khối Tiểu học: mượn trả từ đầu năm.\nĐăng ký thiếu: trừ 1đ/lần; chưa ký nhận/trả trong sổ: trừ 0,5đ/đợt."],
            ['4', 'Chất lượng giáo dục và sự tiến bộ', 15, "Đảm bảo tỷ lệ HS đạt chuẩn kiến thức kỹ năng theo kế hoạch: 5 điểm.\nCó minh chứng về biện pháp cụ thể giúp học sinh có sự tiến bộ rõ rệt, đặc biệt với HS chưa đạt: 10 điểm.\nKết quả tụt giảm nghiêm trọng không lý do chính đáng: trừ 2-5đ.\nKhông có biện pháp hỗ trợ HS chậm tiến: trừ 3đ."],
        ]],
        ['IV', 'Công tác chủ nhiệm', 20, true, [
            ['1', 'Sổ chủ nhiệm / quản lý lớp', 5, "Ghi chép đầy đủ, khoa học, sạch sẽ, cập nhật đúng tiến độ do GVCN trực tiếp thực hiện.\nGhi thiếu/chưa cập nhật thông tin: trừ 2đ/nội dung; báo cáo số liệu tháng muộn: trừ 1đ/lần; nộp sổ muộn: trừ 1đ/lần."],
            ['2', 'Nền nếp và chất lượng lớp chủ nhiệm', 15, "Nội quy trong giờ học (5 điểm): XL Tốt 5đ; Khá 4đ; Đạt 3đ; Chưa đạt 0đ.\nSinh hoạt ngoại khoá, kỹ năng (5 điểm): tập trung đúng giờ, nghiêm túc, giữ kỷ luật, vệ sinh tốt (Tiểu học: rèn thói quen tự phục vụ; THCS: kỷ luật lứa tuổi, phòng chống bạo lực). XL Tốt 5đ; Khá 4đ; Đạt 3đ; Chưa đạt 0đ.\nPhong trào Liên đội (5 điểm): tích cực tham gia các phong trào do Liên đội phát động. XL Tốt 5đ; Khá 4đ; Đạt 3đ; Chưa đạt 0đ."],
        ]],
        ['V', 'Các hoạt động khác', 15, false, [
            ['1', 'Hoạt động trực tuần', 5, "Có mặt đúng giờ; theo dõi, nhắc nhở nền nếp; xử lý hoặc báo cáo kịp thời tình huống phát sinh; ghi sổ trực đầy đủ, rõ ràng.\nKhông trực: trừ 5đ/buổi.\nTrực muộn, về sớm hoặc rời vị trí khi chưa bàn giao: trừ 2đ/lần.\nKhông ghi sổ trực: trừ 3đ/lần.\nGhi thiếu nội dung hoặc không báo cáo sự việc phát sinh: trừ 1đ/lần.\nTrường hợp tháng không được phân công trực: chấm đủ 5 điểm nếu hoàn thành các nhiệm vụ nền nếp khác được giao."],
            ['2', 'Chế độ thông tin, báo cáo', 5, "Nộp đủ, đúng thời hạn; nội dung và số liệu chính xác; đúng thể thức; báo cáo định kỳ gửi bộ phận tổng hợp trước ít nhất 01 ngày, trừ báo cáo đột xuất; cập nhật đầy đủ phần mềm, cơ sở dữ liệu và trang tính được giao.\nSai nội dung, số liệu hoặc thể thức làm báo cáo phải sửa lại: trừ 2đ/báo cáo; sai nghiêm trọng ảnh hưởng tổng hợp chung: trừ 5đ/báo cáo.\nNộp thiếu báo cáo: trừ 2đ/báo cáo.\nNộp muộn nhưng chưa ảnh hưởng nhiệm vụ chung: trừ 2đ/lần.\nNộp muộn làm ảnh hưởng nhiệm vụ chung: trừ 3đ/lần.\nKhông cập nhật hoặc cập nhật chậm dữ liệu/phần mềm: trừ 2đ/lần.\nKhông nộp báo cáo sau khi hết hạn và được nhắc: trừ toàn bộ điểm tiêu chí."],
            ['3', 'Tinh thần chủ động, phối hợp và trách nhiệm', 5, "Chủ động giải quyết công việc; phối hợp hiệu quả với cá nhân, tổ/bộ phận và đơn vị liên quan; không né tránh, đùn đẩy; phản hồi kịp thời; bảo đảm tiến độ chung.\nChậm tiến độ do thiếu chủ động phối hợp: trừ 3đ/nhiệm vụ.\nKết quả thấp do phối hợp không hiệu quả: trừ 3đ/nhiệm vụ.\nNé tránh, đùn đẩy hoặc không phối hợp sau khi được yêu cầu: trừ 5đ/lần.\nKhông phản hồi công việc trong thời hạn được yêu cầu, gây ách tắc: trừ 5đ/lần."],
        ]],
    ];

    private const BONUS = [
        ['1', 'GVDG / chuyên đề cấp thành phố', "Tham gia chỉ đạo, thi GVDG, dạy chuyên đề có hiệu quả, thiết kế bài giảng ứng dụng AI hoặc thiết kế thi E-learning đạt kết quả tốt: +3đ/đợt.\nGiúp đỡ đồng nghiệp thi GVDG đạt kết quả tốt: +2đ/đợt.\nMinh chứng: quyết định; phân công; biên bản; giấy chứng nhận."],
        ['2', 'Thành tích của học sinh', "Trực tiếp phụ trách/bồi dưỡng học sinh đạt giải được công nhận: +3đ/HS đạt giải thành phố; +1đ/HS đạt giải cấp phường.\nMột thành tích chỉ tính mức cao nhất; nếu nhiều người cùng phụ trách thì Hội đồng xác định mức phân bổ.\nMinh chứng: quyết định công nhận; danh sách giải; phân công bồi dưỡng."],
        ['3', 'Khen thưởng đột xuất', "Tham gia đầy đủ, đúng hạn hoặc trực tiếp tổ chức hoạt động đạt kết quả tốt: +0,25đ/lần tham gia đầy đủ, đúng hạn; +1đ/lần chủ động tổ chức/thực hiện nhiệm vụ trọng tâm có hiệu quả. Không cộng đồng thời hai mức cho cùng một hoạt động.\nMinh chứng: giấy khen/bằng khen/quyết định."],
        ['4', 'Hoạt động phong trào, văn nghệ, thể thao, nhân đạo, từ thiện', "Tham gia đầy đủ, đúng hạn: +0,25đ/lần.\nChủ động tổ chức/thực hiện nhiệm vụ trọng tâm có hiệu quả: +1đ/lần.\nKhông cộng đồng thời hai mức cho cùng một hoạt động.\nMinh chứng: kế hoạch; danh sách; kết quả; xác nhận."],
        ['5', 'Sáng kiến / nghiên cứu khoa học', "Sáng kiến hoặc sản phẩm được Hội đồng/cấp có thẩm quyền đánh giá, công nhận: +3đ loại A cấp trường; +2đ loại B; +1đ loại C.\nNộp muộn: trừ 0,25đ/ngày vào điểm cộng của nội dung này; điểm cộng không âm.\nMinh chứng: biên bản đánh giá; quyết định công nhận; thời điểm nộp."],
        ['6', 'Thí điểm tiếng Anh là ngôn ngữ thứ hai', "GVCN, GVBM tham gia lớp thí điểm (theo KH 259): thực hiện tốt việc đưa tiếng Anh (mức 1) vào lớp học; có sáng tạo trong việc tạo môi trường tiếng Anh cho HS; hoặc tham gia tự bồi dưỡng nâng cao, đạt các chứng chỉ tiếng Anh quốc tế/trong nước: +2đ/lần thực hiện hoặc tiết dạy tích hợp.\nMinh chứng: KHBD; hình ảnh tiết học tích hợp tại thời điểm thực hiện; hình ảnh không gian lớp học."],
    ];

    public const BONUS_MAX = 10;

    public function run(): void
    {
        $template = EvaluationTemplate::firstOrCreate(
            ['school_year' => self::SCHOOL_YEAR],
            ['name' => 'Đánh giá thi đua tháng '.self::SCHOOL_YEAR, 'is_active' => true, 'grades' => self::GRADES],
        );
        if ($template->criteria()->exists()) {
            return;
        }

        $position = 0;
        foreach (self::SECTIONS as [$code, $title, $max, $homeroomOnly, $items]) {
            $section = $this->make($template, null, $code, $title, $max, EvaluationCriterion::SCORE, $homeroomOnly, $position++);
            $child = 0;
            foreach ($items as [$itemCode, $itemTitle, $itemMax, $guidance]) {
                $this->make($template, $section, $itemCode, $itemTitle, $itemMax, EvaluationCriterion::SCORE, $homeroomOnly, $child++, $guidance);
            }
        }

        $bonus = $this->make($template, null, 'VI', 'Điểm cộng', self::BONUS_MAX, EvaluationCriterion::BONUS, false, $position);
        $child = 0;
        foreach (self::BONUS as [$code, $title, $guidance]) {
            $this->make($template, $bonus, $code, $title, self::BONUS_MAX, EvaluationCriterion::BONUS, false, $child++, $guidance);
        }
    }

    private function make(EvaluationTemplate $template, ?EvaluationCriterion $parent, string $code, string $title, float $max, string $kind, bool $homeroomOnly, int $position, ?string $guidance = null): EvaluationCriterion
    {
        return EvaluationCriterion::create([
            'template_id' => $template->id, 'parent_id' => $parent?->id, 'code' => $code, 'title' => $title,
            'guidance' => $guidance, 'max_score' => $max, 'kind' => $kind, 'homeroom_only' => $homeroomOnly, 'position' => $position,
        ]);
    }
}
