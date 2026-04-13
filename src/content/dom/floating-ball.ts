/**
 * Floating Action Ball — Shadow DOM isolated FAB with radial menu.
 * Supports drag, hover-expand, translate/clear/settings actions,
 * and a blue ring indicator when translation is active.
 */

const SIZE_CONFIG = {
  small:  { fab: 32, menuItem: 32, menuRadius: 44, fontSize: 15 },
  medium: { fab: 44, menuItem: 44, menuRadius: 58, fontSize: 20 },
  large:  { fab: 56, menuItem: 52, menuRadius: 72, fontSize: 24 },
};

let FAB_SIZE = 44;
let MENU_ITEM_SIZE = 44;
let MENU_RADIUS = 58;
let MENU_FONT_SIZE = 20;
const STORAGE_KEY = 'ft-fab-position';

interface FabCallbacks {
  onTranslate: () => void;
  onClear: () => void;
  onSettings: () => void;
}

function openOptionsPage() {
  chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
}

export function createFloatingBall(callbacks: FabCallbacks, initialSize: 'small' | 'medium' | 'large' = 'medium'): {
  updateTranslatingState: (isTranslating: boolean) => void;
  destroy: () => void;
} {
  // Apply size config
  const sizeConf = SIZE_CONFIG[initialSize];
  FAB_SIZE = sizeConf.fab;
  MENU_ITEM_SIZE = sizeConf.menuItem;
  MENU_RADIUS = sizeConf.menuRadius;
  MENU_FONT_SIZE = sizeConf.fontSize;
  // --- Host element (fixed, high z-index) ---
  const host = document.createElement('div');
  host.id = 'ft-fab-host';
  host.style.cssText = 'all:initial; position:fixed; z-index:2147483647;';

  // Restore saved position or default to right-center
  const saved = loadPosition();
  host.style.right = saved ? 'auto' : '16px';
  host.style.top = saved ? `${saved.y}px` : '50%';
  if (saved) {
    host.style.left = `${saved.x}px`;
  } else {
    host.style.transform = 'translateY(-50%)';
  }

  // --- Shadow DOM ---
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = buildHTML();

  document.body.appendChild(host);

  // --- Element refs ---
  const fab = shadow.querySelector('.ft-fab') as HTMLElement;
  const ring = shadow.querySelector('.ft-fab-ring') as HTMLElement;
  const menu = shadow.querySelector('.ft-fab-menu') as HTMLElement;
  const items = shadow.querySelectorAll('.ft-fab-item') as NodeListOf<HTMLElement>;

  // --- Drag state ---
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let fabStartX = 0;
  let fabStartY = 0;
  let hasMoved = false;

  // --- Hover: show/hide menu using distance-based detection ---
  // This avoids flicker when mouse moves between fab and menu items through gaps.
  let menuOpen = false;
  let checkInterval: ReturnType<typeof setInterval> | null = null;
  let lastMouseX = 0;
  let lastMouseY = 0;

  // Track mouse globally for distance check
  document.addEventListener('mousemove', (e) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  });

  const getCenter = () => {
    const rect = host.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  // Close zone = FAB_SIZE/2 + MENU_RADIUS + MENU_ITEM_SIZE/2 + generous buffer
  const CLOSE_DISTANCE = FAB_SIZE / 2 + MENU_RADIUS + MENU_ITEM_SIZE / 2 + 20;

  const openMenu = () => {
    if (isDragging || menuOpen) return;
    menuOpen = true;
    menu.classList.add('open');
    // Start polling distance
    if (!checkInterval) {
      checkInterval = setInterval(() => {
        const center = getCenter();
        const dist = Math.hypot(lastMouseX - center.x, lastMouseY - center.y);
        if (dist > CLOSE_DISTANCE) {
          closeMenu();
        }
      }, 100);
    }
  };

  const closeMenu = () => {
    menuOpen = false;
    menu.classList.remove('open');
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  };

  fab.addEventListener('mouseenter', openMenu);

  // --- Drag logic ---
  const logo = shadow.querySelector('.ft-fab-logo') as HTMLElement;
  logo.addEventListener('mousedown', (e: MouseEvent) => {
    e.preventDefault();
    isDragging = true;
    hasMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = host.getBoundingClientRect();
    fabStartX = rect.left;
    fabStartY = rect.top;
    fab.classList.add('dragging');
    closeMenu();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
    if (!hasMoved) return;

    let newX = fabStartX + dx;
    let newY = fabStartY + dy;

    // Clamp to viewport
    newX = Math.max(0, Math.min(window.innerWidth - FAB_SIZE, newX));
    newY = Math.max(0, Math.min(window.innerHeight - FAB_SIZE, newY));

    host.style.left = `${newX}px`;
    host.style.top = `${newY}px`;
    host.style.right = 'auto';
    host.style.transform = 'none';
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    fab.classList.remove('dragging');
    if (hasMoved) {
      const rect = host.getBoundingClientRect();
      savePosition(rect.left, rect.top);
      // Reset hasMoved after a tick so the current click event is still blocked
      setTimeout(() => { hasMoved = false; }, 0);
    }
  });

  // --- Menu actions ---
  const translateItem = shadow.querySelector('[data-action="translate"]') as HTMLElement;

  items.forEach(item => {
    item.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      if (hasMoved) return;
      const action = item.getAttribute('data-action');
      switch (action) {
        case 'translate': callbacks.onTranslate(); break;
        case 'clear': callbacks.onClear(); break;
        case 'settings': callbacks.onSettings(); break;
      }
      closeMenu();
    });
  });

  // --- Public API ---
  return {
    updateTranslatingState(isTranslating: boolean) {
      ring.classList.toggle('active', isTranslating);
      // Switch translate button between "译" and "■" (stop)
      // Update icon + tooltip, preserve tooltip span
      const tooltip = translateItem.querySelector('.ft-fab-tooltip');
      translateItem.textContent = '';
      translateItem.appendChild(document.createTextNode(isTranslating ? '⏹' : '🌐'));
      if (tooltip) {
        tooltip.textContent = isTranslating ? '停止翻译' : '全文翻译';
        translateItem.appendChild(tooltip);
      }
      translateItem.classList.toggle('stop-mode', isTranslating);
    },
    destroy() {
      host.remove();
    },
  };
}

// --- Position persistence ---
function loadPosition(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.x === 'number' && typeof pos.y === 'number') {
      // Clamp to current viewport
      return {
        x: Math.max(0, Math.min(window.innerWidth - FAB_SIZE, pos.x)),
        y: Math.max(0, Math.min(window.innerHeight - FAB_SIZE, pos.y)),
      };
    }
  } catch { /* ignore */ }
  return null;
}

function savePosition(x: number, y: number) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y }));
  } catch { /* ignore */ }
}

// --- HTML + CSS (all inside Shadow DOM) ---
function buildHTML(): string {
  // Menu items positioned radially: 3 items at -90°, -210°, -330° (top, bottom-left, bottom-right)
  const angles = [-90, -210, -330];
  const labels = [
    { action: 'translate', icon: '🌐', title: '全文翻译' },
    { action: 'clear', icon: '🧹', title: '清除缓存' },
    { action: 'settings', icon: '⚙️', title: '设置' },
  ];

  const menuItemsHTML = labels.map((item, i) => {
    const rad = (angles[i] * Math.PI) / 180;
    const tx = Math.cos(rad) * MENU_RADIUS;
    const ty = Math.sin(rad) * MENU_RADIUS;
    return `<button class="ft-fab-item" data-action="${item.action}"
              style="--tx:${tx.toFixed(1)}px; --ty:${ty.toFixed(1)}px; --delay:${i * 0.04}s">
              ${item.icon}<span class="ft-fab-tooltip">${item.title}</span></button>`;
  }).join('');

  return `
    <style>
      :host { all: initial; display: block; }

      .ft-fab {
        position: relative;
        width: ${FAB_SIZE}px;
        height: ${FAB_SIZE}px;
        cursor: grab;
      }
      .ft-fab.dragging { cursor: grabbing; }

      /* --- Logo button --- */
      .ft-fab-logo {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: transparent;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        user-select: none;
        transition: opacity 0.25s, transform 0.25s;
        opacity: 0.35;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      }
      .ft-fab:hover .ft-fab-logo,
      .ft-fab.dragging .ft-fab-logo {
        opacity: 1;
        transform: scale(1.08);
      }

      /* --- Blue ring indicator --- */
      .ft-fab-ring {
        position: absolute;
        inset: -4px;
        border-radius: 50%;
        border: 2.5px solid transparent;
        transition: border-color 0.3s;
        pointer-events: none;
      }
      .ft-fab-ring.active {
        border-color: #4A90D9;
        animation: ft-ring-pulse 2s ease-in-out infinite;
      }

      /* --- Radial menu --- */
      .ft-fab-menu {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }

      .ft-fab-item {
        all: initial;
        position: absolute;
        top: 50%;
        left: 50%;
        width: ${MENU_ITEM_SIZE}px;
        height: ${MENU_ITEM_SIZE}px;
        margin: -${MENU_ITEM_SIZE / 2}px;
        border-radius: 50%;
        background: #fff;
        color: #444;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: ${MENU_FONT_SIZE}px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.18);
        pointer-events: auto;
        opacity: 0;
        transform: translate(0, 0) scale(0.3);
        transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                    opacity 0.2s ease,
                    background 0.15s ease;
        transition-delay: var(--delay, 0s);
      }
      .ft-fab-item:hover {
        background: #4A90D9;
      }
      .ft-fab-item:hover .ft-fab-tooltip {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      .ft-fab-item.stop-mode {
        background: #ef4444;
      }
      .ft-fab-item.stop-mode:hover {
        background: #dc2626;
      }

      /* Tooltip */
      .ft-fab-tooltip {
        position: absolute;
        bottom: -28px;
        left: 50%;
        transform: translateX(-50%) translateY(-4px);
        background: rgba(0,0,0,0.75);
        color: #fff;
        font-size: 11px;
        font-family: system-ui, -apple-system, sans-serif;
        white-space: nowrap;
        padding: 3px 8px;
        border-radius: 4px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease, transform 0.15s ease;
      }

      /* Expand menu items to radial positions */
      .ft-fab-menu.open .ft-fab-item {
        opacity: 1;
        transform: translate(var(--tx), var(--ty)) scale(1);
      }

      .ft-fab.dragging .ft-fab-menu { display: none; }

      /* --- Animations --- */
      @keyframes ft-ring-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    </style>

    <div class="ft-fab">
      <div class="ft-fab-ring"></div>
      <div class="ft-fab-logo"><img src="${chrome.runtime.getURL('public/icons/logo-fab.png')}" alt="FT" style="width:100%;height:100%;object-fit:contain;border-radius:50%;pointer-events:none;"></div>
      <div class="ft-fab-menu">
        ${menuItemsHTML}
      </div>
    </div>
  `;
}
