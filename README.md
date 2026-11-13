# 高速飛行史

首頁和詳情頁由 `aircraft/` 中的九份機型資料產生。新增內容的完整規則見 [AGENTS.md](AGENTS.md)。

使用 Node.js 20 以上版本執行 `node build.mjs`，再用瀏覽器開啟 `docs/index.html`。發布到 GitHub Pages 時，選擇主分支的 `/docs` 作為來源。

首版收錄 X-1、D-558-II、X-2、X-15、Tu-144、Concorde、SR-71、X-43A 與 X-59。

X-51A 保留作為新增驗收題。
prompt:請 AI 依照 AGENTS.md 加入 X-51A。AI 可以參考 aircraft/x-43a.md 的資料格式，查證代表事件、速度和來源，再新增 aircraft/x-51a.md。執行 node build.mjs 後，網站會依日期把它排在 X-43A 和 X-59 之間，產生詳情頁並更新上一站、下一站的連結。「待補充」會留在年表末尾。

九站照片目前使用外部圖片網址，需要網路載入。原圖來源和使用權列在各機型頁。
