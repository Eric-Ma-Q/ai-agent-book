# Bảng thuật ngữ Anh - Việt {.unnumbered}

Bản dịch tiếng Việt ưu tiên **giữ thuật ngữ kỹ thuật chính bằng tiếng Anh** và thêm chú thích tiếng Việt ở lần xuất hiện quan trọng, thay vì dịch sát chữ gây khó hiểu. Các thuật ngữ dưới đây được dùng thống nhất trong bản dịch:

| Thuật ngữ | Cách dùng trong bản dịch | Chú thích ngắn |
| --- | --- | --- |
| Agent | Agent | Hệ thống AI có thể lập kế hoạch, gọi công cụ và lặp theo kết quả quan sát. |
| LLM | LLM / Large Language Model | Mô hình ngôn ngữ lớn, phần “bộ não” ra quyết định của Agent. |
| Context | ngữ cảnh / context | Toàn bộ thông tin mô hình nhìn thấy trong một lần gọi: system prompt, lịch sử hội thoại, tool schema, kết quả công cụ, bộ nhớ, v.v. |
| Context Engineering | Context Engineering (kỹ thuật ngữ cảnh) | Thiết kế và quản lý toàn bộ thông tin đưa vào context; rộng hơn prompt engineering. |
| Prompt Engineering | Prompt Engineering (kỹ thuật prompt) | Tối ưu chỉ dẫn ngôn ngữ tự nhiên cho mô hình. |
| Harness | Harness | Lớp hạ tầng bên ngoài mô hình: context, tools, constraints, verification, correction, logging, permission, retry, guardrails. Không dịch là “khai thác”. |
| Harness Engineering | Harness Engineering (kỹ thuật Harness) | Thiết kế lớp hạ tầng bao quanh mô hình để biến năng lực mô hình thành hệ thống đáng tin cậy. |
| Tool calling | tool calling / gọi công cụ | Cơ chế để LLM gọi hàm hoặc công cụ bên ngoài theo cấu trúc. |
| Function calling | function calling | Một dạng tool calling qua API. |
| ReAct | ReAct | Vòng lặp Reasoning + Acting: suy nghĩ, hành động, quan sát rồi lặp lại. |
| Trajectory | trajectory | Chuỗi lịch sử chạy của Agent: user message, model response, tool call, tool result. |
| Observation | observation | Kết quả Agent quan sát được sau một hành động hoặc tool call. |
| Action Space | Action Space | Tập hợp hành động/công cụ mà Agent có thể thực hiện. |
| Observation Space | Observation Space | Tập hợp thông tin Agent có thể quan sát. |
| Policy | Policy | Chiến lược ra quyết định trong RL; ánh xạ observation sang action. |
| Post-training | post-training | Các bước sau pretraining như SFT/RL để tinh chỉnh hành vi mô hình. |
| SFT | SFT / supervised fine-tuning | Fine-tuning có giám sát bằng dữ liệu mẫu. |
| RL | RL / reinforcement learning | Học tăng cường bằng reward từ môi trường hoặc verifier. |
| In-Context Learning | In-Context Learning (học trong ngữ cảnh) | Mô hình học tạm từ ví dụ/quy tắc nằm trong context mà không đổi trọng số. |
| External Learning | External Learning (học bên ngoài tham số mô hình) | Lưu tri thức/quy trình vào file, knowledge base, memory hoặc tool thay vì ghi vào trọng số mô hình. |
| RAG | RAG / Retrieval-Augmented Generation | Truy xuất tài liệu liên quan rồi đưa vào context để mô hình trả lời. |
| Agentic RAG | Agentic RAG | RAG do Agent chủ động quyết định khi nào truy xuất và truy xuất gì. |
| KV Cache | KV Cache | Bộ nhớ đệm key/value của transformer giúp tái sử dụng phần prefix đã tính. |
| Prompt injection | prompt injection | Tấn công tiêm chỉ dẫn độc hại vào prompt/context. |
| Guardrails | guardrails | Các lớp kiểm soát, ràng buộc, xác minh và chặn rủi ro. |
| Sidecar | Sidecar | Thành phần kiểm tra/phê duyệt chạy song song hoặc kèm Agent chính. |
| HITL | HITL / Human-in-the-Loop | Cơ chế có con người tham gia xác nhận hoặc phê duyệt. |
| Observability | observability | Khả năng quan sát hệ thống qua log, trace, metric, audit trail. |
| Artifact | artifact | Sản phẩm trung gian/cuối cùng do Agent tạo ra: file, SQL, slide, video, report. |
| Vibe coding | vibe coding | Cách làm việc/lập trình với AI bằng mô tả ý định, thảo luận và để Agent triển khai; trong sách có nhấn mạnh dùng giọng nói. |
| Computer Use | Computer Use | Agent thao tác GUI/trình duyệt/máy tính như người dùng. |
| Multi-agent | multi-agent | Hệ thống nhiều Agent phối hợp hoặc phân vai. |
