# data-lms-hutech

Kho đáp án JSON cho các khóa học trên LMS HUTECH, được xuất bởi `auto-lms-admin-extension` và được `auto-lms-client-extension` đọc qua GitHub Pages:

```
https://t-root.github.io/data-lms-hutech/<MÃ_MÔN>-<baitap|ontap>-answers.json
```

## Quy ước tên file

- `<MÃ_MÔN>-baitap-answers.json`: đáp án bài tập
- `<MÃ_MÔN>-ontap-answers.json`: đáp án ôn tập

Ví dụ: `ECOS120-baitap-answers.json`, `ECOS120-ontap-answers.json`.

## Định dạng

```jsonc
{
  "version": 1,
  "courseCode": "ECOS120",
  "exportedAt": "2026-09-14T16:00:41.375Z",
  "answers": [
    {
      "title": "Tên bài",
      "url": "https://lms.hutech.edu.vn/xblock/...",
      ...
    }
  ]
}
```

## Các môn hiện có

ECMP172, ECMP373, ECOS1001, ECOS120, ECOS321, ECOS323, EMAT105.

## Thêm môn mới

1. Dùng `auto-lms-admin-extension` làm bài, bấm **Xuất file đáp án**.
2. Copy các file JSON vào repo này, commit và push lên nhánh `main`.
