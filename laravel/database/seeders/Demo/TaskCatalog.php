<?php

namespace Database\Seeders\Demo;

class TaskCatalog
{
    // title, category, scope, priority, requirement bullets
    public const TEMPLATES = [
        ['Nộp kế hoạch giáo dục cá nhân tháng {m}', 'Hành chính', 'school', 'normal', ['Theo mẫu của nhà trường', 'Ghi rõ nội dung bồi dưỡng thường xuyên']],
        ['Báo cáo sĩ số và chuyên cần tháng {m}', 'Báo cáo', 'school', 'high', ['Tổng hợp theo từng lớp chủ nhiệm', 'Nêu rõ học sinh nghỉ dài ngày']],
        ['Kiểm tra hồ sơ chuyên môn định kỳ tháng {m}', 'Chuyên môn', 'school', 'normal', ['Kế hoạch bài dạy, sổ điểm, sổ dự giờ', 'Tổ trưởng ký xác nhận trước khi nộp']],
        ['Tham gia tập huấn chuyển đổi số trong dạy học', 'Chuyên môn', 'school', 'normal', ['Hoàn thành bài kiểm tra cuối khóa', 'Nộp ảnh chụp chứng nhận']],
        ['Rà soát học sinh có hoàn cảnh khó khăn', 'Công tác chủ nhiệm', 'school', 'high', ['Lập danh sách theo mẫu', 'Đề xuất mức hỗ trợ']],
        ['Đăng ký tiết dạy thao giảng chào mừng 20/11', 'Phong trào', 'school', 'normal', ['Mỗi giáo viên đăng ký ít nhất 1 tiết', 'Ghi rõ lớp và thời gian dạy']],
        ['Chuẩn bị chương trình văn nghệ ngày Nhà giáo Việt Nam', 'Sự kiện', 'school', 'high', ['Mỗi tổ 1 tiết mục', 'Gửi danh sách diễn viên và trang phục']],
        ['Tổng hợp kết quả học tập giữa học kỳ', 'Báo cáo', 'school-secondary', 'high', ['Thống kê theo môn và theo lớp', 'Nhận xét nguyên nhân học sinh yếu']],
        ['Đánh giá định kỳ học sinh tiểu học giữa kỳ', 'Báo cáo', 'school-primary', 'high', ['Nhập kết quả lên phần mềm', 'Gửi bản in có chữ ký giáo viên chủ nhiệm']],
        ['Họp phụ huynh học sinh cuối học kỳ', 'Công tác chủ nhiệm', 'school', 'urgent', ['Chuẩn bị nội dung báo cáo lớp', 'Gửi biên bản họp sau buổi họp']],
        ['Xây dựng kế hoạch hoạt động {unit} tháng {m}', 'Chuyên môn', 'to', 'normal', ['Bám sát kế hoạch năm học', 'Phân công cụ thể từng thành viên']],
        ['Sinh hoạt chuyên môn theo nghiên cứu bài học', 'Chuyên môn', 'to', 'normal', ['Chọn bài dạy minh họa', 'Ghi biên bản và rút kinh nghiệm']],
        ['Nộp biên bản họp {unit} tháng {m}', 'Hành chính', 'to', 'low', ['Có chữ ký thư ký và tổ trưởng']],
        ['Dự giờ đồng nghiệp tháng {m}', 'Chuyên môn', 'to', 'normal', ['Tối thiểu 2 tiết mỗi giáo viên', 'Nộp phiếu dự giờ']],
        ['Kiểm tra vở sạch chữ đẹp {unit}', 'Chuyên môn', 'to-primary', 'normal', ['Chấm theo tiêu chí của trường', 'Chọn 3 vở tiêu biểu mỗi lớp']],
        ['Tổ chức hoạt động trải nghiệm {unit}', 'Sự kiện', 'to-primary', 'high', ['Lên kịch bản và dự trù kinh phí', 'Chụp ảnh hoạt động gửi về trường']],
        ['Chuẩn bị đồ dùng dạy học tự làm', 'Phong trào', 'to-primary', 'low', ['Mỗi giáo viên 1 sản phẩm', 'Kèm bản thuyết minh ngắn']],
        ['Ra đề kiểm tra giữa kỳ môn {subject}', 'Chuyên môn', 'nhom', 'high', ['Đề, đáp án và ma trận', 'Theo định dạng của Phòng GD&ĐT']],
        ['Xây dựng ma trận đề kiểm tra cuối kỳ môn {subject}', 'Chuyên môn', 'nhom', 'normal', ['Cân đối 4 mức độ nhận thức']],
        ['Chuẩn bị chuyên đề dạy học môn {subject}', 'Chuyên môn', 'nhom', 'normal', ['Chọn chủ đề tích hợp', 'Có tiết dạy minh họa']],
        ['Bồi dưỡng học sinh giỏi môn {subject}', 'Chuyên môn', 'nhom', 'high', ['Lập kế hoạch theo tuần', 'Báo cáo kết quả khảo sát đội tuyển']],
        ['Cập nhật ngân hàng câu hỏi môn {subject}', 'Chuyên môn', 'nhom', 'low', ['Bổ sung ít nhất 20 câu mỗi người']],
        ['Chuẩn bị tiết dạy minh họa cấp trường', 'Chuyên môn', 'person', 'urgent', ['Giáo án và bài giảng điện tử', 'Dạy thử trước tổ']],
        ['Hoàn thiện hồ sơ đánh giá chuẩn nghề nghiệp', 'Hành chính', 'person', 'normal', ['Tự đánh giá theo phiếu', 'Đính kèm minh chứng']],
        ['Kiểm kê thiết bị dạy học của tổ', 'Hành chính', 'person', 'low', ['Đối chiếu sổ theo dõi thiết bị', 'Ghi rõ thiết bị hỏng cần thay']],
        ['Viết bài tuyên truyền an toàn giao thông', 'Phong trào', 'person', 'low', ['Khoảng 500 chữ, kèm ảnh minh họa']],
        ['Dạy thay tiết lớp {class} tuần {w}', 'Chuyên môn', 'person', 'high', ['Theo kế hoạch bài dạy của giáo viên nghỉ']],
        ['Phụ trách đội tuyển Hội khỏe Phù Đổng', 'Phong trào', 'person', 'normal', ['Lịch tập 3 buổi mỗi tuần', 'Danh sách vận động viên']],
        ['Báo cáo tiến độ bồi dưỡng học sinh yếu', 'Báo cáo', 'person', 'normal', ['Nêu số học sinh tiến bộ', 'Đề xuất giải pháp tiếp theo']],
        ['Cập nhật tin tức hoạt động lên website trường', 'Hành chính', 'person', 'low', ['Tối thiểu 2 tin mỗi tuần']],
        ['Báo cáo quyết toán kinh phí tháng {m}', 'Báo cáo', 'office', 'high', ['Đối chiếu chứng từ thu chi', 'Gửi bản ký số cho Ban giám hiệu']],
        ['Vào sổ và lưu trữ công văn đến tháng {m}', 'Hành chính', 'office', 'normal', ['Phân loại theo nơi ban hành', 'Cập nhật sổ công văn đến']],
        ['Cập nhật hồ sơ sức khỏe học sinh', 'Hành chính', 'office', 'normal', ['Bổ sung kết quả khám sức khỏe định kỳ', 'Lập danh sách học sinh cần theo dõi']],
        ['Kiểm kê tài sản, thiết bị cuối học kỳ', 'Hành chính', 'office', 'normal', ['Đối chiếu sổ theo dõi tài sản', 'Lập biên bản thiết bị hỏng, cần thanh lý']],
        ['Lập bảng lương và phụ cấp tháng {m}', 'Hành chính', 'office', 'urgent', ['Cập nhật ngày công, phụ cấp chủ nhiệm', 'Trình Ban giám hiệu ký duyệt']],
        ['Tổ chức tuần lễ đọc sách tại thư viện', 'Sự kiện', 'office', 'normal', ['Trưng bày sách theo chủ đề', 'Phối hợp giáo viên chủ nhiệm đưa lớp đến thư viện']],
        ['Chuẩn bị hồ sơ thi đua khen thưởng cuối năm', 'Phong trào', 'office', 'high', ['Tổng hợp danh sách đề nghị khen thưởng', 'Hoàn thiện tờ trình theo mẫu']],
        ['Tự học bồi dưỡng thường xuyên module {n}', 'Chuyên môn', 'personal', 'normal', ['Ghi chép nội dung chính', 'Làm bài tập cuối module']],
        ['Soạn bài giảng điện tử chương {n}', 'Chuyên môn', 'personal', 'normal', ['Có video và câu hỏi tương tác']],
        ['Hoàn thành khóa học AI trong giảng dạy', 'Chuyên môn', 'personal', 'low', ['Hoàn thành 5 bài học trực tuyến']],
        ['Chuẩn bị đồ dùng trực quan tiết {n}', 'Chuyên môn', 'personal', 'low', ['Tranh ảnh, mô hình phù hợp bài học']],
        ['Viết sáng kiến kinh nghiệm năm học', 'Phong trào', 'personal', 'high', ['Đề cương, nội dung và minh chứng áp dụng']],
    ];

    public const ASSIGNEE_COMMENTS = [
        'Cô cho em hỏi file nộp dạng Word hay PDF ạ?',
        'Em đang hoàn thiện, chiều nay em gửi ạ.',
        'Nhóm em đã họp và phân công xong rồi ạ.',
        'Em xin gia hạn thêm 1 ngày vì trùng lịch kiểm tra ạ.',
        'Phần số liệu lớp 7A2 em chưa có, em sẽ bổ sung sau.',
        'Em đã để bản nháp trong kho dữ liệu, nhờ thầy góp ý giúp em.',
        'Mẫu báo cáo năm nay có thay đổi gì so với năm ngoái không ạ?',
        'Em đã gửi bản in cho văn phòng, bản mềm em nộp ở đây.',
        'Lớp em có 2 học sinh nghỉ ốm, em ghi chú trong báo cáo rồi ạ.',
        'Em nhờ cô Lan xem trước phần nội dung rồi ạ.',
    ];

    public const MANAGER_COMMENTS = [
        'Nộp bản PDF giúp tôi nhé.',
        'Được, hạn mới là thứ Sáu tuần này.',
        'Bản nháp ổn, bổ sung thêm phần đánh giá học sinh nhé.',
        'Cảm ơn các thầy cô, các tổ đang đúng tiến độ.',
        'Lưu ý trình bày theo mẫu của Phòng GD&ĐT.',
        'Ai chưa nộp thì hoàn thành trước 17h hôm nay giúp tôi.',
        'Giữ nguyên mẫu năm ngoái, chỉ cập nhật số liệu.',
        'Phần này các thầy cô trao đổi thêm trong buổi họp tổ thứ Năm.',
        'Tôi đã xem, cần ghi rõ nguồn tài liệu tham khảo.',
    ];

    public const SUBMISSION_NOTES = [
        'Em gửi bản hoàn chỉnh, mời thầy cô xem.',
        'Đã hoàn thành, file đính kèm bên dưới.',
        'Bản đã chỉnh sửa theo góp ý lần trước.',
        'Em gửi kèm link thư mục ảnh minh chứng.',
        'Nhóm đã thống nhất nội dung, em đại diện gửi.',
        'Gửi tổ trưởng bản tổng hợp của cả nhóm.',
        'Đã nộp đủ theo yêu cầu.',
    ];

    public const REVISION_COMMENTS = [
        'Bổ sung ma trận đề và đáp án chi tiết.',
        'Thiếu ảnh minh chứng hoạt động, bổ sung giúp tôi.',
        'Số liệu lớp 8B chưa khớp với sổ điểm, kiểm tra lại.',
        'Định dạng chưa đúng mẫu, chỉnh lại cỡ chữ 13 và lề trái 3 cm.',
        'Phần kế hoạch tuần 3 còn sơ sài, viết cụ thể hơn.',
        'Cần có chữ ký xác nhận của tổ trưởng.',
    ];

    public const APPROVAL_COMMENTS = [
        'Bài làm tốt, cảm ơn thầy cô.',
        'Đạt yêu cầu.',
        'Nội dung đầy đủ, trình bày rõ ràng.',
        'Rất chu đáo, tổ sẽ dùng làm mẫu.',
    ];

    public const CANCEL_REASONS = [
        'Kế hoạch thay đổi theo chỉ đạo của Phòng GD&ĐT.',
        'Gộp chung với công việc khác.',
        'Hoạt động hoãn do thời tiết.',
    ];

    public const LINKS = [
        'https://drive.google.com/drive/folders/thanhdam-minh-chung',
        'https://docs.google.com/document/d/thanhdam-ke-hoach',
        'https://docs.google.com/spreadsheets/d/thanhdam-tong-hop',
        'https://youtu.be/thanhdam-tiet-day',
    ];

    public const ATTACHMENTS = ['Mẫu báo cáo.docx', 'Kế hoạch chi tiết.pdf', 'Danh sách phân công.xlsx', 'Hướng dẫn thực hiện.pdf'];

    public const SUBMISSION_FILES = ['Báo cáo.docx', 'Kế hoạch.pdf', 'Tổng hợp số liệu.xlsx', 'Ảnh minh chứng.png', 'Biên bản.pdf'];
}
