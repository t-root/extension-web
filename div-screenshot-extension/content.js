(function () {
  let isActive = false;
  let hoveredElement = null;

  // Nút bật/tắt dò div nổi trên màn hình
  const toggleBtn = document.createElement("button");
  toggleBtn.innerText = "🎯 Bật Dò Div";
  toggleBtn.style.cssText = `
    position: fixed;
    top: 15px;
    right: 15px;
    z-index: 999999;
    padding: 10px 16px;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 20px;
    font-weight: bold;
    cursor: pointer;
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    font-family: sans-serif;
    font-size: 14px;
    transition: all 0.2s ease;
  `;
  document.body.appendChild(toggleBtn);

  // Style viền đỏ khi di chuột qua Div
  const highlightStyle = `
    outline: 2px dashed #ff4757 !important;
    outline-offset: -2px !important;
    background-color: rgba(255, 71, 87, 0.1) !important;
    cursor: crosshair !important;
  `;

  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    isActive = !isActive;
    if (isActive) {
      toggleBtn.innerText = "🛑 Tắt Dò Div";
      toggleBtn.style.background = "#dc3545";
    } else {
      toggleBtn.innerText = "🎯 Bật Dò Div";
      toggleBtn.style.background = "#007bff";
      removeHighlight();
    }
  });

  function removeHighlight() {
    if (hoveredElement) {
      hoveredElement.style.outline = "";
      hoveredElement.style.outlineOffset = "";
      hoveredElement.style.backgroundColor = "";
      hoveredElement.style.cursor = "";
      hoveredElement = null;
    }
  }

  // Dò div khi rê chuột
  document.addEventListener(
    "mouseover",
    (e) => {
      if (!isActive) return;
      const target = e.target.closest("div");
      if (!target || target === toggleBtn) return;

      removeHighlight();
      hoveredElement = target;
      target.style.cssText += highlightStyle;
    },
    true
  );

  document.addEventListener(
    "mouseout",
    (e) => {
      if (!isActive) return;
      removeHighlight();
    },
    true
  );

  // Click vào Div để chụp và tải ảnh
  document.addEventListener(
    "click",
    async (e) => {
      if (!isActive) return;
      const target = e.target.closest("div");
      if (!target || target === toggleBtn) return;

      e.preventDefault();
      e.stopPropagation();

      removeHighlight();

      if (typeof html2canvas === "undefined") {
        alert("Thư viện chụp ảnh đang nạp, vui lòng click lại sau 1 giây!");
        return;
      }

      try {
        toggleBtn.innerText = "⏳ Đang chụp...";

        const canvas = await html2canvas(target, {
          useCORS: true,
          logging: false,
          backgroundColor: null,
          scale: 2 // Tăng chất lượng ảnh chụp
        });

        // Tải ảnh về máy
        const link = document.createElement("a");
        link.download = `div-capture-${Date.now()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } catch (err) {
        console.error("Lỗi khi chụp div:", err);
        alert("Khắc phục lỗi: Không thể chụp div này (do dính ảnh bảo mật từ domain khác).");
      } finally {
        toggleBtn.innerText = "🛑 Tắt Dò Div";
      }
    },
    true
  );
})();