import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req: Request) {
  try {
    const { rawText, splitCards, categories } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Chưa cấu hình GEMINI_API_KEY trong file .env.local' },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
Bạn là trợ lý kỹ thuật chuyên tóm tắt kiến thức theo phương pháp Spaced Repetition.
Danh sách chủ đề hiện có: ${(categories || []).join(', ')}.
Nội dung đầu vào của người học: """${rawText}"""

Yêu cầu:
${
  splitCards
    ? 'Hãy tách nội dung trên thành NHIỀU thẻ kiến thức độc lập (mỗi thiết bị/khái niệm là 1 thẻ riêng).'
    : 'Hãy tổng hợp toàn bộ nội dung trên vào DUY NHẤT 1 thẻ kiến thức để liên kết các ý.'
}

Trả về kết quả CHỈ LÀ MỘT JSON HỢP LỆ (không dùng markdown \`\`\`json) theo đúng cấu trúc sau:
{
  "cards": [
    {
      "title": "Tên khái niệm ngắn gọn, rõ ràng",
      "category": "Chọn 1 chủ đề phù hợp nhất",
      "context": "Ngữ cảnh ứng dụng thực tế ngắn gọn",
      "notes": [
        "Ý cốt lõi 1 (Bản chất / Công dụng)",
        "Ý cốt lõi 2 (Nguyên lý hoạt động / Thông số)",
        "Ý cốt lõi 3 (Lưu ý thực tế khi vận hành / phân biệt)"
      ],
      "diagram": "[Khối A] ➔ [Khối B] ➔ [Khối C] (Sơ đồ luồng ký tự 1 dòng)"
    }
  ]
}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(text);

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Lỗi xử lý AI' }, { status: 500 });
  }
}