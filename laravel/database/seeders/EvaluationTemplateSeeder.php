<?php

namespace Database\Seeders;

use App\Models\EvaluationCriterion;
use App\Models\EvaluationTemplate;
use Illuminate\Database\Seeder;

class EvaluationTemplateSeeder extends Seeder
{
    public const BONUS_MAX = 10;

    private const META = [
        EvaluationTemplate::TEACHER => ['Tiêu chí thi đua giáo viên', 'Theo bảng tiêu chí chấm điểm thi đua hằng tháng dành cho giáo viên (văn bản 5.10).', 'VI'],
        EvaluationTemplate::STAFF => ['Tiêu chí thi đua nhân viên', 'Theo bảng tiêu chí chấm điểm thi đua hằng tháng dành cho nhân viên (văn bản 5.10).', 'IV'],
        EvaluationTemplate::LEADERSHIP => ['Tiêu chí thi đua Ban giám hiệu', 'Theo bảng tiêu chí chấm điểm thi đua hằng tháng dành cho Ban giám hiệu (văn bản 5.10).', 'IV'],
    ];

    private const TEACHER_GRADES = [
        ['code' => 'xuat_sac', 'name' => 'Xuất sắc', 'homeroom_min' => 100, 'regular_min' => 80, 'clean_required' => true, 'requires_no_zero' => false, 'condition' => 'Không vi phạm QCCM, Đạo đức nhà giáo. Hoàn thành xuất sắc công việc.'],
        ['code' => 'a', 'name' => 'Loại A (Tốt)', 'homeroom_min' => 95, 'regular_min' => 75, 'clean_required' => true, 'requires_no_zero' => false, 'condition' => 'Không vi phạm QCCM, Đạo đức nhà giáo.'],
        ['code' => 'b', 'name' => 'Loại B (Khá)', 'homeroom_min' => 85, 'regular_min' => 65, 'clean_required' => true, 'requires_no_zero' => false, 'condition' => 'Không vi phạm QCCM, Đạo đức nhà giáo.'],
        ['code' => 'c', 'name' => 'Loại C (Trung bình)', 'homeroom_min' => 65, 'regular_min' => 50, 'clean_required' => false, 'requires_no_zero' => false, 'condition' => 'Nhắc nhở chuyên môn hoặc mắc lỗi hành chính đã khắc phục.'],
    ];

    private const OFFICE_GRADES = [
        ['code' => 'xuat_sac', 'name' => 'Mức Xuất sắc', 'homeroom_min' => 80, 'regular_min' => 80, 'clean_required' => true, 'requires_no_zero' => true, 'condition' => 'Kết quả công việc nổi trội; không có tiêu chí bị 0 điểm; không có vi phạm đã được cấp có thẩm quyền kết luận trong tháng.'],
        ['code' => 'a', 'name' => 'Mức A', 'homeroom_min' => 75, 'regular_min' => 75, 'clean_required' => false, 'requires_no_zero' => true, 'condition' => 'Hoàn thành tốt nhiệm vụ tháng; không có tiêu chí bị 0 điểm.'],
        ['code' => 'b', 'name' => 'Mức B', 'homeroom_min' => 65, 'regular_min' => 65, 'clean_required' => false, 'requires_no_zero' => false, 'condition' => 'Hoàn thành cơ bản nhiệm vụ tháng; còn hạn chế nhưng đã khắc phục.'],
        ['code' => 'c', 'name' => 'Mức C', 'homeroom_min' => 50, 'regular_min' => 50, 'clean_required' => false, 'requires_no_zero' => false, 'condition' => 'Hoàn thành một phần nhiệm vụ; cần có biện pháp khắc phục cụ thể.'],
        ['code' => 'chua_dat', 'name' => 'Chưa đạt', 'homeroom_min' => 0, 'regular_min' => 0, 'clean_required' => false, 'requires_no_zero' => false, 'condition' => 'Dưới 50 điểm. Không dùng cụm từ “không xếp loại” để thay cho quy trình đánh giá viên chức hoặc xử lý kỷ luật.'],
    ];

    private const SETS = [
        EvaluationTemplate::TEACHER => [
            'sections' => [
                ['I', 'Nền nếp, tác phong', 10, false, [
                    ['1', 'Ngày, giờ công', 8, 'Đi làm đầy đủ; có mặt, bắt đầu và kết thúc công việc đúng thời gian; tham gia đầy đủ các cuộc họp, sinh hoạt và hoạt động tập thể được triệu tập.
Đi muộn, về sớm, họp muộn dưới 30 phút: trừ 0,5đ/lần.
Đi muộn/về sớm từ 30 phút trở lên hoặc vắng 01 buổi họp không có lý do chính đáng: trừ 1đ/lần.
Nghỉ về việc riêng, có phép và được sự đồng ý của BGH: trừ 1đ/buổi.
Nghỉ không phép, bỏ vị trí/ca trực hoặc tự ý đổi lịch không báo người có thẩm quyền: trừ 8đ /lần; trường hợp nghiêm trọng xem xét theo quy định sau khi có kết luận.
Nghỉ chế độ thai sản; hiếu hỉ của bản thân, bố mẹ, con (được nghỉ 3 ngày); Nghỉ giỗ tứ thân phụ mẫu (được nghỉ 1 ngày) không trừ điểm, nhưng không tính ngày công cao.
Nếu nghỉ trên 8 ngày (hay 16 buổi) trong một năm học sẽ không xếp loại thi đua đợt IV.
Nếu nghỉ từ 3 ngày/đợt hoặc 12 ngày/năm HĐTĐ sẽ xem xét theo chất lượng và hiệu quả công việc để xét thi đua đợt và năm học sau đó ra quyết định.
Trường hợp nghỉ được phân công dạy thay không đúng chuyên môn thì GV phải lên lịch dạy bù trình BGH phê duyệt.'],
                    ['2', 'Trang phục, đồng phục và tác phong', 2, 'Trang phục lịch sự, gọn gàng, đeo thẻ tên phù hợp văn hóa công sở; thực hiện âu phục (hoặc áo trắng) vào thứ Hai hằng tuần và lễ phục/đồng phục trường trong các ngày lễ theo quy định; giao tiếp chuẩn mực.
Không thực hiện đúng âu phục (hoặc áo trắng) vào thứ Hai: trừ 0,5 đ/lần.
Không mặc lễ phục/đồng phục trường vào ngày khai giảng, 20/11 hoặc tổng kết: trừ 0,5 đ/lần.
Trang phục không bảo đảm văn hóa công sở, tác phong thiếu nghiêm túc: trừ 1 đ/lần.
Hành vi, lời nói thiếu chuẩn mực đã được nhắc nhở mà tái phạm: trừ 2 đ; trường hợp có dấu hiệu vi phạm thì xem xét theo quy trình riêng.'],
                ]],
                ['II', 'Hồ sơ sổ sách', 10, false, [
                    ['1', 'Kế hoạch bài dạy (KHBD)', 2.5, 'Chung: Đầy đủ KHBD theo KHDH đúng về số tiết theo chương trình, rõ hoạt động và thể hiện triển khai tích hợp tiếng anh trong các tiêu đề của KHBD; Từng bước ứng dụng học liệu số và công nghệ trong dạy học, nộp đúng hạn.
Đối với các lớp tham gia lộ trình thí điểm đưa tiếng Anh là ngôn ngữ thứ hai (mức 1 - khởi đầu), KHBD phải thể hiện việc tích hợp tiếng Anh trong các tiêu đề bài học, sử dụng các khẩu lệnh tiếng Anh cơ bản (Classroom English) trong tổ chức lớp học, khởi động hoặc trò chơi. Tổ chức các hoạt động làm quen, giao tiếp bằng tiếng Anh để hình thành thói quen cho HS. Việc tích hợp phải tự nhiên, không gây quá tải và không làm sai lệch kiến thức môn học.
Lên lớp không có KHBD: Không xếp loại tháng..
Tiểu học: chú trọng tích hợp, phát triển năng lực, học liệu số.
THCS: đúng cấu trúc bài dạy, phát triển kỹ năng.
Soạn không đúng quy định trừ 1đ.'],
                    ['2', 'Sổ điểm và Đánh giá học sinh', 2.5, 'Cấp THCS: vào sổ điểm điện tử, chấm trả bài, vào điểm cá nhân đúng tiến độ theo Thông tư 22/2021.
Cấp Tiểu học: Cập nhật nhận xét, đánh giá thường xuyên/định kỳ trên phần mềm CSDL theo Thông tư 27/2020.
Vào điểm/nhận xét muộn trừ 1đ/lần; sửa điểm sai quy định trừ 0,5đ/lỗi; nhập sai điểm/nhận xét sai thực tế trừ 2,5đ/lỗi; sai quy trình hạ 1 bậc thi đua.'],
                    ['3', 'Sổ tổ, biên bản họp CM và Phiếu TĐ', 2.5, 'Ghi chép sinh hoạt nhóm/tổ CM đầy đủ, chi tiết, nộp sổ tổ đúng thời hạn.
Thống kê kết quả bài KTTX, KTĐK đúng thực tế, đúng hạn.
Hoàn thành phiếu tự đánh giá thi đua đúng thời gian.
Thiếu nội dung SHCM tổ/nhóm: trừ 1đ/lần; Thống kê sai thực tế: trừ 2đ/lần; Nộp muộn phiếu/kết quả: trừ 1đ/lần.'],
                    ['4', 'Sổ ghi đầu bài / sổ giao nhận HS', 2.5, 'Khối THCS: GVBM yêu cầu HS ghi đầy đủ, ký sổ từng tiết. GVCN kiểm tra, nhận xét hàng tuần. Đảm bảo số TT, ND tiết học trùng khớp với LBG và KHBD.
Khối Tiểu học: GV dạy cập nhật sổ giao nhận HS đầy đủ. GVCN xác nhận.
Bỏ ký sổ đầu bài/sổ giao nhận HS: trừ 2đ/tiết; Lịch báo giảng và sổ đầu bài không khớp: trừ 1đ/lỗi; GVCN không kiểm tra/nhận xét tuần: trừ 1đ/lần.
GV Dạy thay/quản giờ nếu không ký: đánh giá GV quản giờ/dạy thay.'],
                ]],
                ['III', 'Chuyên môn', 45, false, [
                    ['1', 'Tổ chức dạy học và KTĐG', 15, '- Đảm bảo dạy học phát triển năng lực; ra đề/ma trận kiểm tra đúng chuẩn kiến thức, định dạng đổi mới theo HDCM: 5 điểm.
- Phát hiện, phân loại đối tượng HS, có biện pháp bồi dưỡng kịp thời nâng cao năng lực học sinh: 10 điểm. Cá nhân xây dựng các biện pháp giáo dục áp dụng với từng đối tượng HS trình BGH phê duyệt.
- Đề thi sai kiến thức: trừ 4đ/đề.
- Ra đề sai ma trận/nộp muộn: trừ 2đ/đề.
- Dạy rập khuôn, không chuẩn bị, chưa có ứng dụng hiệu quả CN số… (qua dự giờ của tổ, nhóm CM, BGH): trừ 2đ/lần.'],
                    ['2', 'Năng lực số và đổi mới sáng tạo', 10, '- Ứng dụng hiệu quả công nghệ số, AI, bài giảng E-learning vào thực tế giảng dạy: 5 điểm.
- Chủ động thực hiện các chuyên đề, bài dạy minh họa cấp tổ/trường mang lại hiệu quả: 5 điểm.
- Không thực hiện nhiệm vụ chuyên đề được giao mà không có ý do chính đáng: Không xét TĐ tháng.
- Dạy chuyên đề không đạt mà không khắc phục: trừ 3đ.'],
                    ['3', 'Sử dụng đồ dùng, TBDH và CNTT/AI', 5, '- Đăng ký mượn/trả TBDH đúng quy định, ký sổ đầy đủ. Tích cực ứng dụng CNTT/AI trong giảng dạy, Khuyến khích sử dụng các học liệu số, bài giảng điện tử có thiết kế song ngữ (hoặc có chú thích từ vựng tiếng Anh) phục vụ cho các lớp thí điểm.
+ Khối THCS: trước 1 ngày/đầu tuần.
+ Khối Tiểu học: mượn trả từ đầu năm.
Đăng ký thiếu: trừ 1đ/lần; Chưa ký nhận/trả trong sổ: trừ 0.5đ/đợt.'],
                    ['4', 'Chất lượng GD và Sự tiến bộ', 15, '- Đảm bảo tỷ lệ HS đạt chuẩn kiến thức kỹ năng theo kế hoạch: 5 điểm.
- Có minh chứng về biện pháp cụ thể giúp học sinh có sự tiến bộ rõ rệt đặc biệt với HS Chưa đạt: 10 điểm.
- Kết quả tụt giảm nghiêm trọng không lý do chính đáng: trừ 2-5đ.
- Không có biện pháp hỗ trợ HS chậm tiến: trừ 3đ.'],
                ]],
                ['IV', 'Công tác chủ nhiệm', 20, true, [
                    ['1', 'Sổ chủ nhiệm / Quản lý lớp', 5, 'Ghi chép đầy đủ, khoa học, sạch sẽ, cập nhật đúng tiến độ do GVCN trực tiếp thực hiện.
Ghi thiếu/chưa cập nhật thông tin: trừ 2đ/nội dung; Báo cáo số liệu tháng muộn: trừ 1đ/lần; Nộp sổ muộn: trừ 1đ/lần.'],
                    ['2', 'Nền nếp và chất lượng lớp chủ nhiệm', 15, 'Nội quy trong giờ học (5điểm): XL Tốt: 5đ; XL Khá: 4đ; XL Đạt: 3đ; XL CĐ: 0đ.
Sinh hoạt ngọai khoá, kỹ năng (5điểm): Tập trung đúng giờ, nghiêm túc, giữ kỷ luật, vệ sinh tốt. (Tiểu học: Rèn thói quen tự phục vụ; THCS: Kỷ luật lứa tuổi, phòng chống bạo lực). XL Tốt: 5đ; Khá: 4đ; Đạt: 3đ; CĐ: 0đ.
Phong trào Liên đội (5điểm): Tích cực tham gia các phong trào do Liên đội phát động. XL Tốt: 5đ; Khá: 4đ; Đạt: 3đ; CĐ: 0đ.'],
                ]],
                ['V', 'Các hoạt động khác', 15, false, [
                    ['1', 'Hoạt động trực tuần', 5, 'Có mặt đúng giờ; theo dõi, nhắc nhở nền nếp; xử lý hoặc báo cáo kịp thời tình huống phát sinh; ghi sổ trực đầy đủ, rõ ràng.
Không trực: trừ 5 đ/buổi.
Trực muộn, về sớm hoặc rời vị trí khi chưa bàn giao: trừ 2đ/lần.
Không ghi sổ trực: trừ 3đ/lần.
Ghi thiếu nội dung hoặc không báo cáo sự việc phát sinh: trừ 1 đ/lần.
Trường hợp tháng không được phân công trực: chấm đủ 5 điểm nếu hoàn thành các nhiệm vụ nền nếp khác được giao.'],
                    ['2', 'Chế độ thông tin, báo cáo', 5, 'Nộp đủ, đúng thời hạn; nội dung và số liệu chính xác; đúng thể thức; báo cáo định kỳ gửi bộ phận tổng hợp trước ít nhất 01 ngày, trừ báo cáo đột xuất; cập nhật đầy đủ phần mềm, cơ sở dữ liệu và trang tính được giao.
Sai nội dung, số liệu hoặc thể thức làm báo cáo phải sửa lại: trừ 2đ/báo cáo; sai nghiêm trọng ảnh hưởng tổng hợp chung: trừ 5đ/báo cáo.
Nộp thiếu báo cáo: trừ 2đ/báo cáo.
Nộp muộn nhưng chưa ảnh hưởng nhiệm vụ chung: trừ 2đ/lần.
Nộp muộn làm ảnh hưởng nhiệm vụ chung: trừ 3đ/lần.
Không cập nhật hoặc cập nhật chậm dữ liệu/phần mềm: trừ 2đ/lần.
Không nộp báo cáo sau khi hết hạn và được nhắc: trừ toàn bộ 10đ/lần.'],
                    ['3', 'Tinh thần chủ động, phối hợp và trách nhiệm', 5, 'Chủ động giải quyết công việc; phối hợp hiệu quả với cá nhân, tổ/bộ phận và đơn vị liên quan; không né tránh, đùn đẩy; phản hồi kịp thời; bảo đảm tiến độ chung.
Chậm tiến độ do thiếu chủ động phối hợp: trừ 3đ/nhiệm vụ.
Kết quả thấp do phối hợp không hiệu quả: trừ 3đ/nhiệm vụ.
Né tránh, đùn đẩy hoặc không phối hợp sau khi được yêu cầu: trừ 5đ/lần.
Không phản hồi công việc trong thời hạn được yêu cầu, gây ách tắc: trừ 5đ/lần.'],
                ]],
            ],
            'bonus' => [
                ['1', 'GVDG / Chuyên đề cấp thành phố', 'Tham gia chỉ đạo, thi GVDG, dạy chuyên đề có hiệu quả, thiết kế bài giảng ứng dụng AI hoặc thiết kế thi E-learning đạt KQ tốt.
Giúp đỡ đồng nghiệp thi GVDG đạt kết quả tốt.
Mức điểm cộng: +3đ/đợt; +2đ/đợt
Minh chứng: Quyết định; phân công; biên bản; giấy chứng nhận'],
                ['2', 'Thành tích của học sinh', 'Trực tiếp phụ trách/bồi dưỡng học sinh đạt giải được công nhận.
Một thành tích chỉ tính mức cao nhất; nếu nhiều người cùng phụ trách thì Hội đồng xác định mức phân bổ.
Mức điểm cộng: +3đ/HS đạt giải TP; +1/HS đạt giải cấp phường
Minh chứng: Quyết định công nhận; danh sách giải; phân công bồi dưỡng'],
                ['3', 'Khen thưởng đột xuất', 'Tham gia đầy đủ, đúng hạn hoặc trực tiếp tổ chức hoạt động đạt kết quả tốt.
0,25 điểm/lần tham gia đầy đủ, đúng hạn; +1 điểm/lần chủ động tổ chức/thực hiện nhiệm vụ trọng tâm có hiệu quả. Không cộng đồng thời hai mức cho cùng một hoạt động.
Mức điểm cộng: +0,25đ/lần – 1đ/ lần
Minh chứng: Giấy khen/bằng khen/quyết định'],
                ['4', 'Hoạt động phong trào, văn nghệ, thể thao, nhân đạo, từ thiện', 'Tham gia đầy đủ, đúng hạn hoặc trực tiếp tổ chức hoạt động đạt kết quả tốt.
Cộng 0,25 điểm/lần tham gia đầy đủ, đúng hạn;
Cộng 1 điểm/lần chủ động tổ chức/thực hiện nhiệm vụ trọng tâm có hiệu quả.
Không cộng đồng thời hai mức cho cùng một hoạt động.
Mức điểm cộng: +0,25đ/lần đến +1đ/lần
Minh chứng: Kế hoạch; danh sách; kết quả; xác nhận'],
                ['5', 'Sáng kiến/ Nghiên cứu khoa học', 'Sáng kiến hoặc sản phẩm được Hội đồng/cấp có thẩm quyền đánh giá, công nhận.
Cộng 3 điểm loại A cấp trường; Cộng 2 điểm loại B; Cộng 1 điểm loại C.
Nộp muộn: trừ 0,25đ/ngày vào điểm cộng của nội dung này; điểm cộng không âm.
Mức điểm cộng: +1đ đến +3đ điểm
Minh chứng: Biên bản đánh giá; quyết định công nhận; thời điểm nộp'],
                ['6', 'Thí điểm Tiếng Anh ngôn ngữ 2', 'GVCN, GVBM tham gia lớp thí: thực hiện tốt việc đưa tiếng Anh (mức 1) vào lớp học; có sáng tạo trong việc tạo môi trường tiếng Anh cho HS; hoặc tham gia tự bồi dưỡng nâng cao hoặc đạt các chứng chỉ tiếng Anh quốc tế/trong nước.
Mức điểm cộng: +2đ/lần thực hiện hoặc tiết dạy tích hợp
Minh chứng: KHBD; hình ảnh tiết học tích hợp tại thời điểm thực hiện; Hình ảnh không gian lớp học'],
            ],
        ],
        EvaluationTemplate::STAFF => [
            'sections' => [
                ['I', 'Nền nếp, tác phong', 10, false, [
                    ['1', 'Ngày, giờ công', 8, 'Đi làm đầy đủ; có mặt, bắt đầu và kết thúc công việc đúng thời gian; tham gia đầy đủ các cuộc họp, sinh hoạt và hoạt động tập thể được triệu tập.
- Đi muộn, về sớm, họp muộn dưới 30 phút: trừ 0,5đ/lần.
- Đi muộn/về sớm từ 30 phút trở lên hoặc vắng 01 buổi họp không có lý do chính đáng: trừ 1đ/lần.
- Nghỉ về việc riêng, có phép và được sự đồng ý của BGH: trừ 1đ/buổi.
- Nghỉ không phép, bỏ vị trí/ca trực hoặc tự ý đổi lịch không báo người có thẩm quyền: trừ 8đ /lần; trường hợp nghiêm trọng xem xét theo quy định sau khi có kết luận.
- Nghỉ chế độ thai sản; hiếu hỉ của bản thân, bố mẹ, con (được nghỉ 3 ngày); Nghỉ giỗ tứ thân phụ mẫu (được nghỉ 1 ngày) không trừ điểm, nhưng không tính ngày công cao.
- Nếu nghỉ trên 8 ngày (hay 16 buổi) trong một năm học sẽ không xếp loại thi đua đợt IV.
- Nếu nghỉ từ 3 ngày/đợt hoặc 12 ngày/năm HĐTĐ sẽ xem xét theo chất lượng và hiệu quả công việc để xét thi đua đợt và năm học sau đó ra quyết định.
Minh chứng: Chấm công; lịch họp; sổ trực; giấy xin phép; xác nhận của tổ/bộ phận'],
                    ['2', 'Trang phục, đồng phục và tác phong', 2, 'Trang phục lịch sự, gọn gàng, phù hợp văn hóa công sở; thực hiện âu phục vào thứ Hai hằng tuần và lễ phục/đồng phục trường trong các ngày lễ theo quy định; giao tiếp chuẩn mực.
- Không thực hiện đúng âu phục (hoặc áo trắng) vào thứ Hai: trừ 0,5đ/lần.
- Không mặc lễ phục/đồng phục trường vào ngày khai giảng, 20/11 hoặc tổng kết:  trừ 0,5đ/lần..
- Trang phục không bảo đảm văn hóa công sở, tác phong thiếu nghiêm túc:  trừ 1đ/lần..
- Hành vi, lời nói thiếu chuẩn mực đã được nhắc nhở mà tái phạm: trừ toàn bộ 2 điểm của tiêu chí; trường hợp có dấu hiệu vi phạm thì xem xét theo quy trình riêng.
Minh chứng: Theo dõi nền nếp; biên bản/ghi nhận; phản ánh đã được xác minh'],
                ]],
                ['II', 'Chất lượng, hiệu quả công việc', 50, false, [
                    ['3', 'Mức độ hoàn thành nhiệm vụ được giao', 30, 'Hoàn thành đầy đủ nhiệm vụ thường xuyên và đột xuất, đúng tiến độ, đúng yêu cầu; sản phẩm chính xác, có chất lượng, hiệu quả; chủ động tham mưu và chịu trách nhiệm về kết quả.
Chọn 01 mức ban đầu:
- 30 điểm: hoàn thành tốt, đúng hạn; chất lượng cao; vượt chỉ tiêu từ 20% trở lên hoặc có sản phẩm/giải pháp nâng cao hiệu quả.
- 25 điểm: hoàn thành đầy đủ, đúng hạn, chất lượng khá; còn không quá 02 lỗi nhỏ và đã sửa đúng hạn.
- 20 điểm: hoàn thành cơ bản; còn 01 nhiệm vụ chậm nhưng không ảnh hưởng công việc chung hoặc 03-04 lỗi nhỏ.
- 15 điểm: chất lượng trung bình; chậm tiến độ, phải nhắc nhở; từ 05 lỗi trở lên nhưng vẫn hoàn thành.
- 10 điểm: chất lượng thấp, hoàn thành muộn, phải làm lại nhiều lần.
- 0 điểm: không hoàn thành hoặc từ chối nhiệm vụ không có lý do chính đáng; việc đánh giá/xử lý tiếp theo thực hiện theo quy trình riêng.
Trừ bổ sung (không trùng lỗi đã dùng để xác định mức ban đầu): thiếu 01 sản phẩm/nội dung: 2 điểm; sai 01 số liệu/nội dung: 2 điểm; chậm 01 mốc: 2 điểm; không cập nhật tiến độ sau yêu cầu: 2 điểm/lần.
Minh chứng: Kế hoạch/lịch công tác; phiếu giao việc; sản phẩm; thời điểm nộp; ý kiến nghiệm thu'],
                    ['4', 'Hồ sơ, sổ sách giấy và điện tử', 20, 'Lập đủ hồ sơ thuộc lĩnh vực phụ trách; ghi chép rõ ràng, khoa học, chính xác; cập nhật kịp thời; bảo quản an toàn; chứng từ hợp lệ; dữ liệu giấy và điện tử thống nhất.
- Thiếu 01 loại hồ sơ/sổ hoặc 01 nội dung bắt buộc: trừ 2 điểm.
- Ghi chép/cập nhật chậm, thiếu hoặc sai 01 nội dung: trừ 2 điểm/nội dung.
- Sắp xếp, bảo quản chưa khoa học, có hư hỏng do chủ quan nhưng khắc phục được: trừ 2 điểm/lần.
- Dữ liệu giấy và điện tử không thống nhất: trừ 2 điểm/nội dung.
- Làm mất hồ sơ hoặc không lập/không cập nhật hồ sơ theo nhiệm vụ: trừ 10 điểm/lần; đồng thời xem xét trách nhiệm theo quy định.
- Sai sót đã được nhắc lần 1 nhưng không sửa trong thời hạn: trừ tiếp 2 điểm/nội dung; tái diễn được ghi nhận khi bình xét cuối kỳ.
Minh chứng: Danh mục hồ sơ; sổ giấy; hệ thống điện tử; biên bản kiểm tra; lịch sử cập nhật'],
                ]],
                ['III', 'Các hoạt động khác', 20, false, [
                    ['5', 'Thực hiện nhiệm vụ trực tuần/trực lãnh đạo', 5, 'Có mặt đúng giờ; theo dõi, nhắc nhở nền nếp; xử lý hoặc báo cáo kịp thời tình huống phát sinh; ghi sổ trực đầy đủ, rõ ràng.
- Không trực: trừ 5 điểm/buổi.
- Trực muộn, về sớm hoặc rời vị trí khi chưa bàn giao: trừ 2 điểm/lần.
- Không ghi sổ trực: trừ 3 điểm/lần.
- Ghi thiếu nội dung hoặc không báo cáo sự việc phát sinh: trừ 1 điểm/lần.
- Trường hợp tháng không được phân công trực: chấm đủ 5 điểm nếu hoàn thành các nhiệm vụ nền nếp khác được giao.
Minh chứng: Lịch trực; sổ trực; camera (nếu có); xác nhận của bộ phận liên quan'],
                    ['6', 'Chế độ thông tin, báo cáo', 10, 'Nộp đủ, đúng thời hạn; nội dung và số liệu chính xác; đúng thể thức; báo cáo định kỳ gửi bộ phận tổng hợp trước ít nhất 01 ngày, trừ báo cáo đột xuất; cập nhật đầy đủ phần mềm, cơ sở dữ liệu và trang tính được giao.
- Sai nội dung, số liệu hoặc thể thức làm báo cáo phải sửa lại: trừ 2 điểm/báo cáo; sai nghiêm trọng ảnh hưởng tổng hợp chung: trừ 5 điểm/báo cáo.
- Nộp thiếu báo cáo: trừ 2 điểm/báo cáo.
- Nộp muộn nhưng chưa ảnh hưởng nhiệm vụ chung: trừ 2 điểm/lần.
- Nộp muộn làm ảnh hưởng nhiệm vụ chung: trừ 3 điểm/lần.
- Không cập nhật hoặc cập nhật chậm dữ liệu/phần mềm: trừ 2 điểm/lần.
- Không nộp báo cáo sau khi hết hạn và được nhắc: trừ toàn bộ 10 điểm/lần.
Minh chứng: Sổ văn bản; email/nhóm công việc; thời gian hệ thống; báo cáo; cơ sở dữ liệu'],
                    ['7', 'Tinh thần chủ động, phối hợp và trách nhiệm', 5, 'Chủ động giải quyết công việc; phối hợp hiệu quả với cá nhân, tổ/bộ phận và đơn vị liên quan; không né tránh, đùn đẩy; phản hồi kịp thời; bảo đảm tiến độ chung.
- Chậm tiến độ do thiếu chủ động phối hợp: trừ 3 điểm/nhiệm vụ.
- Kết quả thấp do phối hợp không hiệu quả: trừ 3 điểm/nhiệm vụ.
- Né tránh, đùn đẩy hoặc không phối hợp sau khi được yêu cầu: trừ 5 điểm/lần.
- Không phản hồi công việc trong thời hạn được yêu cầu, gây ách tắc: trừ 5 điểm/lần.
Minh chứng: Phiếu giao việc; trao đổi công việc; xác nhận của đơn vị phối hợp; kết quả nhiệm vụ'],
                ]],
            ],
            'bonus' => [
                ['1', 'Chỉ đạo/tham gia hội thi giáo viên dạy giỏi, chuyên đề', 'Tham gia thực chất, hoàn thành nhiệm vụ và có sản phẩm/kết quả được xác nhận.
+3 điểm/đợt đối với trực tiếp chỉ đạo, dự thi hoặc dạy chuyên đề có hiệu quả; +2 điểm/đợt đối với hỗ trợ đồng nghiệp có hiệu quả. Không cộng trùng cho cùng một vai trò, cùng một kết quả.
Minh chứng: Quyết định; phân công; biên bản; giấy chứng nhận'],
                ['2', 'Thành tích học sinh', 'Trực tiếp phụ trách/bồi dưỡng học sinh đạt giải được công nhận.
+3 điểm/học sinh hoặc môn đạt cấp thành phố; +1 điểm/học sinh hoặc môn đạt cấp phường. Một thành tích chỉ tính mức cao nhất; nếu nhiều người cùng phụ trách thì Hội đồng xác định mức phân bổ.
Minh chứng: Quyết định công nhận; danh sách giải; phân công bồi dưỡng'],
                ['3', 'Khen thưởng đột xuất', 'Cá nhân được cấp có thẩm quyền khen thưởng đột xuất trong tháng.
+3 điểm/lần. Một thành tích được nhiều cấp khen chỉ tính mức cao nhất.
Minh chứng: Giấy khen/bằng khen/quyết định'],
                ['4', 'Hoạt động phong trào, văn nghệ, thể thao, nhân đạo, từ thiện', 'Tham gia đầy đủ, đúng hạn hoặc trực tiếp tổ chức hoạt động đạt kết quả tốt.
+0,25 điểm/lần tham gia đầy đủ, đúng hạn; +1 điểm/lần chủ động tổ chức/thực hiện nhiệm vụ trọng tâm có hiệu quả. Không cộng đồng thời hai mức cho cùng một hoạt động.
Minh chứng: Kế hoạch; danh sách; kết quả; xác nhận'],
                ['5', 'Sáng kiến/sản phẩm nghiên cứu khoa học', 'Sáng kiến hoặc sản phẩm được Hội đồng/cấp có thẩm quyền đánh giá, công nhận.
+3 điểm loại A cấp trường; +2 điểm loại B; +1 điểm loại C. Nộp muộn: trừ 0,25 điểm/ngày vào điểm cộng của nội dung này; điểm cộng không âm.
Minh chứng: Biên bản đánh giá; quyết định công nhận; thời điểm nộp'],
            ],
        ],
        EvaluationTemplate::LEADERSHIP => [
            'sections' => [
                ['I', 'Nền nếp, tác phong', 10, false, [
                    ['1', 'Ngày, giờ công', 8, 'Đi làm đầy đủ; có mặt, bắt đầu và kết thúc công việc đúng thời gian; tham gia đầy đủ các cuộc họp, sinh hoạt và hoạt động tập thể được triệu tập.
- Đi muộn, về sớm, họp muộn dưới 30 phút: trừ 0,5đ/lần.
- Đi muộn/về sớm từ 30 phút trở lên hoặc vắng 01 buổi họp không có lý do chính đáng: trừ 1đ/lần.
- Nghỉ về việc riêng, có phép và được sự đồng ý của BGH: trừ 1đ/buổi.
- Nghỉ không phép, bỏ vị trí/ca trực hoặc tự ý đổi lịch không báo người có thẩm quyền: trừ 8đ/lần; trường hợp nghiêm trọng xem xét theo quy định sau khi có kết luận.
- Nghỉ chế độ thai sản; hiếu hỉ của bản thân, bố mẹ, con (được nghỉ 3 ngày); Nghỉ giỗ tứ thân phụ mẫu (được nghỉ 1 ngày) không trừ điểm, nhưng không tính ngày công cao.
- Nếu nghỉ trên 8 ngày (hay 16 buổi) trong một năm học sẽ không xếp loại thi đua đợt IV.
- Nếu nghỉ từ 3 ngày/đợt hoặc 12 ngày/năm HĐTĐ sẽ xem xét theo chất lượng và hiệu quả công việc để xét thi đua đợt và năm học sau đó ra quyết định.
- Trường hợp nghỉ được phân công dạy thay không đúng chuyên môn thì GV phải lên lịch dạy bù trình BGH phê duyệt.
Minh chứng: Chấm công; lịch họp; sổ trực; giấy xin phép; xác nhận của tổ/bộ phận'],
                    ['2', 'Trang phục, đồng phục và tác phong', 2, 'Trang phục lịch sự, gọn gàng, phù hợp văn hóa công sở; thực hiện âu phục vào thứ Hai hằng tuần và lễ phục/đồng phục trường trong các ngày lễ theo quy định; giao tiếp chuẩn mực.
- Không thực hiện đúng âu phục (hoặc áo trắng) vào thứ Hai: trừ 0,5đ/lần.
- Không mặc lễ phục/đồng phục trường vào ngày khai giảng, 20/11 hoặc tổng kết:  trừ 0,5đ/lần..
- Trang phục không bảo đảm văn hóa công sở, tác phong thiếu nghiêm túc:  trừ 1đ/lần..
- Hành vi, lời nói thiếu chuẩn mực đã được nhắc nhở mà tái phạm: trừ toàn bộ 2 điểm của tiêu chí; trường hợp có dấu hiệu vi phạm thì xem xét theo quy trình riêng.
Minh chứng: Theo dõi nền nếp; biên bản/ghi nhận; phản ánh đã được xác minh'],
                ]],
                ['II', 'Chất lượng, hiệu quả công việc', 50, false, [
                    ['3', 'Mức độ hoàn thành nhiệm vụ được giao', 30, 'Hoàn thành đầy đủ nhiệm vụ thường xuyên và đột xuất, đúng tiến độ, đúng yêu cầu; sản phẩm chính xác, có chất lượng, hiệu quả; chủ động tham mưu và chịu trách nhiệm về kết quả.
Chọn 01 mức ban đầu:
- 30 điểm: hoàn thành tốt, đúng hạn; chất lượng cao; vượt chỉ tiêu từ 20% trở lên hoặc có sản phẩm/giải pháp nâng cao hiệu quả.
- 25 điểm: hoàn thành đầy đủ, đúng hạn, chất lượng khá; còn không quá 02 lỗi nhỏ và đã sửa đúng hạn.
- 20 điểm: hoàn thành cơ bản; còn 01 nhiệm vụ chậm nhưng không ảnh hưởng công việc chung hoặc 03-04 lỗi nhỏ.
- 15 điểm: chất lượng trung bình; chậm tiến độ, phải nhắc nhở; từ 05 lỗi trở lên nhưng vẫn hoàn thành.
- 10 điểm: chất lượng thấp, hoàn thành muộn, phải làm lại nhiều lần.
- 0 điểm: không hoàn thành hoặc từ chối nhiệm vụ không có lý do chính đáng; việc đánh giá/xử lý tiếp theo thực hiện theo quy trình riêng.
Trừ bổ sung (không trùng lỗi đã dùng để xác định mức ban đầu): thiếu 01 sản phẩm/nội dung: 2 điểm; sai 01 số liệu/nội dung: 2 điểm; chậm 01 mốc: 2 điểm; không cập nhật tiến độ sau yêu cầu: 2 điểm/lần.
Minh chứng: Kế hoạch/lịch công tác; phiếu giao việc; sản phẩm; thời điểm nộp; ý kiến nghiệm thu'],
                    ['4', 'Hồ sơ, sổ sách giấy và điện tử', 20, 'Lập đủ hồ sơ thuộc lĩnh vực phụ trách; ghi chép rõ ràng, khoa học, chính xác; cập nhật kịp thời; bảo quản an toàn; chứng từ hợp lệ; dữ liệu giấy và điện tử thống nhất.
- Thiếu 01 loại hồ sơ/sổ hoặc 01 nội dung bắt buộc: trừ 2 điểm.
- Ghi chép/cập nhật chậm, thiếu hoặc sai 01 nội dung: trừ 2 điểm/nội dung.
- Sắp xếp, bảo quản chưa khoa học, có hư hỏng do chủ quan nhưng khắc phục được: trừ 2 điểm/lần.
- Dữ liệu giấy và điện tử không thống nhất: trừ 2 điểm/nội dung.
- Làm mất hồ sơ hoặc không lập/không cập nhật hồ sơ theo nhiệm vụ: trừ 10 điểm/lần; đồng thời xem xét trách nhiệm theo quy định.
- Sai sót đã được nhắc lần 1 nhưng không sửa trong thời hạn: trừ tiếp 2 điểm/nội dung; tái diễn được ghi nhận khi bình xét cuối kỳ.
Minh chứng: Danh mục hồ sơ; sổ giấy; hệ thống điện tử; biên bản kiểm tra; lịch sử cập nhật'],
                ]],
                ['III', 'Các hoạt động khác', 20, false, [
                    ['5', 'Thực hiện nhiệm vụ trực tuần/trực lãnh đạo', 5, 'Có mặt đúng giờ; theo dõi, nhắc nhở nền nếp; xử lý hoặc báo cáo kịp thời tình huống phát sinh; ghi sổ trực đầy đủ, rõ ràng.
- Không trực: trừ 5 điểm/buổi.
- Trực muộn, về sớm hoặc rời vị trí khi chưa bàn giao: trừ 2 điểm/lần.
- Không ghi sổ trực: trừ 3 điểm/lần.
- Ghi thiếu nội dung hoặc không báo cáo sự việc phát sinh: trừ 1 điểm/lần.
- Trường hợp tháng không được phân công trực: chấm đủ 5 điểm nếu hoàn thành các nhiệm vụ nền nếp khác được giao.
Minh chứng: Lịch trực; sổ trực; camera (nếu có); xác nhận của bộ phận liên quan'],
                    ['6', 'Chế độ thông tin, báo cáo', 10, 'Nộp đủ, đúng thời hạn; nội dung và số liệu chính xác; đúng thể thức; báo cáo định kỳ gửi bộ phận tổng hợp trước ít nhất 01 ngày, trừ báo cáo đột xuất; cập nhật đầy đủ phần mềm, cơ sở dữ liệu và trang tính được giao.
- Sai nội dung, số liệu hoặc thể thức làm báo cáo phải sửa lại: trừ 2 điểm/báo cáo; sai nghiêm trọng ảnh hưởng tổng hợp chung: trừ 5 điểm/báo cáo.
- Nộp thiếu báo cáo: trừ 2 điểm/báo cáo.
- Nộp muộn nhưng chưa ảnh hưởng nhiệm vụ chung: trừ 2 điểm/lần.
- Nộp muộn làm ảnh hưởng nhiệm vụ chung: trừ 3 điểm/lần.
- Không cập nhật hoặc cập nhật chậm dữ liệu/phần mềm: trừ 2 điểm/lần.
- Không nộp báo cáo sau khi hết hạn và được nhắc: trừ toàn bộ 10 điểm/lần.
Minh chứng: Sổ văn bản; email/nhóm công việc; thời gian hệ thống; báo cáo; cơ sở dữ liệu'],
                    ['7', 'Tinh thần chủ động, phối hợp và trách nhiệm', 5, 'Chủ động giải quyết công việc; phối hợp hiệu quả với cá nhân, tổ/bộ phận và đơn vị liên quan; không né tránh, đùn đẩy; phản hồi kịp thời; bảo đảm tiến độ chung.
- Chậm tiến độ do thiếu chủ động phối hợp: trừ 3 điểm/nhiệm vụ.
- Kết quả thấp do phối hợp không hiệu quả: trừ 3 điểm/nhiệm vụ.
- Né tránh, đùn đẩy hoặc không phối hợp sau khi được yêu cầu: trừ 5 điểm/lần.
- Không phản hồi công việc trong thời hạn được yêu cầu, gây ách tắc: trừ 5 điểm/lần.
Minh chứng: Phiếu giao việc; trao đổi công việc; xác nhận của đơn vị phối hợp; kết quả nhiệm vụ'],
                ]],
            ],
            'bonus' => [
                ['1', 'Chỉ đạo/tham gia hội thi giáo viên dạy giỏi, chuyên đề', 'Tham gia thực chất, hoàn thành nhiệm vụ và có sản phẩm/kết quả được xác nhận.
+3 điểm/đợt đối với trực tiếp chỉ đạo, dự thi hoặc dạy chuyên đề có hiệu quả; +2 điểm/đợt đối với hỗ trợ đồng nghiệp có hiệu quả. Không cộng trùng cho cùng một vai trò, cùng một kết quả.
Minh chứng: Quyết định; phân công; biên bản; giấy chứng nhận'],
                ['2', 'Thành tích học sinh', 'Trực tiếp phụ trách/bồi dưỡng học sinh đạt giải được công nhận.
+3 điểm/học sinh hoặc môn đạt cấp thành phố; +1 điểm/học sinh hoặc môn đạt cấp phường. Một thành tích chỉ tính mức cao nhất; nếu nhiều người cùng phụ trách thì Hội đồng xác định mức phân bổ.
Minh chứng: Quyết định công nhận; danh sách giải; phân công bồi dưỡng'],
                ['3', 'Khen thưởng đột xuất', 'Cá nhân được cấp có thẩm quyền khen thưởng đột xuất trong tháng.
+3 điểm/lần. Một thành tích được nhiều cấp khen chỉ tính mức cao nhất.
Minh chứng: Giấy khen/bằng khen/quyết định'],
                ['4', 'Hoạt động phong trào, văn nghệ, thể thao, nhân đạo, từ thiện', 'Tham gia đầy đủ, đúng hạn hoặc trực tiếp tổ chức hoạt động đạt kết quả tốt.
+0,25 điểm/lần tham gia đầy đủ, đúng hạn; +1 điểm/lần chủ động tổ chức/thực hiện nhiệm vụ trọng tâm có hiệu quả. Không cộng đồng thời hai mức cho cùng một hoạt động.
Minh chứng: Kế hoạch; danh sách; kết quả; xác nhận'],
                ['5', 'Sáng kiến/sản phẩm nghiên cứu khoa học', 'Sáng kiến hoặc sản phẩm được Hội đồng/cấp có thẩm quyền đánh giá, công nhận.
+3 điểm loại A cấp trường; +2 điểm loại B; +1 điểm loại C. Nộp muộn: trừ 0,25 điểm/ngày vào điểm cộng của nội dung này; điểm cộng không âm.
Minh chứng: Biên bản đánh giá; quyết định công nhận; thời điểm nộp'],
            ],
        ],
    ];

    public function run(): void
    {
        foreach (self::SETS as $audience => $set) {
            if (EvaluationTemplate::where('audience', $audience)->exists()) {
                continue;
            }
            [$name, $description, $bonusCode] = self::META[$audience];
            $template = EvaluationTemplate::create([
                'name' => $name.' '.$this->schoolYear(), 'audience' => $audience, 'description' => $description, 'is_active' => true,
                'grades' => $audience === EvaluationTemplate::TEACHER ? self::TEACHER_GRADES : self::OFFICE_GRADES,
            ]);

            $position = 0;
            foreach ($set['sections'] as [$code, $title, $max, $homeroomOnly, $items]) {
                $section = $this->make($template, null, $code, $title, $max, EvaluationCriterion::SCORE, $homeroomOnly, $position++);
                foreach ($items as $child => [$itemCode, $itemTitle, $itemMax, $guidance]) {
                    $this->make($template, $section, $itemCode, $itemTitle, $itemMax, EvaluationCriterion::SCORE, $homeroomOnly, $child, $guidance, false, $itemTitle === 'Ngày, giờ công');
                }
            }

            $bonus = $this->make($template, null, $bonusCode, 'Điểm cộng', self::BONUS_MAX, EvaluationCriterion::BONUS, false, $position);
            foreach ($set['bonus'] as $child => [$code, $title, $guidance]) {
                $this->make($template, $bonus, $code, $title, self::BONUS_MAX, EvaluationCriterion::BONUS, false, $child, $guidance, true);
            }
        }
    }

    private function make(EvaluationTemplate $template, ?EvaluationCriterion $parent, string $code, string $title, float $max, string $kind, bool $homeroomOnly, int $position, ?string $guidance = null, bool $requiresEvidence = false, bool $tracksLeave = false): EvaluationCriterion
    {
        return EvaluationCriterion::create([
            'template_id' => $template->id, 'parent_id' => $parent?->id, 'code' => $code, 'title' => $title, 'guidance' => $guidance,
            'max_score' => $max, 'kind' => $kind, 'homeroom_only' => $homeroomOnly, 'requires_evidence' => $requiresEvidence,
            'tracks_leave' => $tracksLeave, 'position' => $position,
        ]);
    }

    private function schoolYear(): string
    {
        $start = now()->month >= 8 ? now()->year : now()->year - 1;

        return $start.'–'.($start + 1);
    }
}
