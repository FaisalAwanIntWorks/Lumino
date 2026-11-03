import { useEffect } from 'react';

export function GlassmorphismProvider() {
  useEffect(() => {
    const id = 'glass-ui-styles';
    if (document.getElementById(id)) return;

    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      /* ===== WARM MINIMAL UI — Zoo-Inspired Clean Theme ===== */

      /* ---- Page background: warm linen ---- */
      .glass-ui .glass-main-bg {
        background: #FAF8F5 !important;
      }

      /* ---- Sidebar ---- */
      .glass-ui aside {
        background: #FFFFFF !important;
        border-right: 1px solid #F0EDE8 !important;
        box-shadow: none !important;
      }
      .glass-ui aside a:hover,
      .glass-ui aside button:hover {
        background: #FAF8F5 !important;
        border-radius: 10px;
      }
      .glass-ui aside a[data-active="true"],
      .glass-ui aside a.bg-primary\\/15,
      .glass-ui aside .bg-primary\\/15 {
        background: #F5F2ED !important;
        border-left: 2px solid #681223;
        border-radius: 0 10px 10px 0;
      }

      /* ---- Top Header Bar ---- */
      .glass-ui header {
        background: #FFFFFF !important;
        border-bottom: 1px solid #F0EDE8 !important;
        box-shadow: none !important;
      }
      .glass-ui header input:not([type="checkbox"]):not([type="radio"]) {
        background: #FAF8F5 !important;
        border: 1px solid #E8E4DF !important;
        border-radius: 10px;
      }
      .glass-ui header input:focus {
        border-color: #D5D0CA !important;
        box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.03);
      }

      /* ---- Mobile menu bar ---- */
      .glass-ui .md\\:hidden.border-b {
        background: #FFFFFF !important;
        border-bottom: 1px solid #F0EDE8 !important;
      }

      /* ---- Cards / Panels ---- */
      .glass-ui .glass-panel,
      .glass-ui .bg-card,
      .glass-ui .glass-card {
        background: #FFFFFF !important;
        border: 1px solid #F0EDE8 !important;
        border-radius: 16px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04) !important;
      }
      .glass-ui .glass-panel:hover,
      .glass-ui .bg-card:hover,
      .glass-ui .glass-card:hover {
        border-color: #E8E4DF !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06) !important;
      }

      /* ---- Subpanels ---- */
      .glass-ui .glass-subpanel {
        background: #FAF8F5 !important;
        border: 1px solid #F0EDE8 !important;
        border-radius: 12px;
        box-shadow: none !important;
      }

      /* ---- Inputs ---- */
      .glass-ui input:not([type="checkbox"]):not([type="radio"]),
      .glass-ui textarea,
      .glass-ui select {
        background: #FFFFFF !important;
        border: 1px solid #E8E4DF !important;
        border-radius: 10px;
      }
      .glass-ui input:focus,
      .glass-ui textarea:focus,
      .glass-ui select:focus {
        border-color: #D5D0CA !important;
        box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.03);
        outline: none;
      }

      /* ---- Date pill ---- */
      .glass-ui .glass-date-pill {
        background: #FFFFFF !important;
        border: 1px solid #E8E4DF !important;
        border-radius: 10px;
      }

      /* ---- Tables ---- */
      .glass-ui thead th {
        background: #FAF8F5 !important;
        color: #9B9590;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-size: 11px;
      }
      .glass-ui tbody tr {
        border-color: #F0EDE8 !important;
      }
      .glass-ui tbody tr:hover {
        background: #FAF8F5 !important;
      }

      /* ---- Modals / Dialogs ---- */
      .glass-ui [role="dialog"] > div,
      .glass-ui [data-radix-popper-content-wrapper] > div {
        background: #FFFFFF !important;
        border: 1px solid #F0EDE8 !important;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.04) !important;
        border-radius: 16px;
      }

      /* ---- Popover / Dropdown ---- */
      .glass-ui .bg-popover {
        background: #FFFFFF !important;
        border: 1px solid #F0EDE8 !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.06) !important;
        border-radius: 12px;
      }

      /* ---- Dividers ---- */
      .glass-ui .border-border,
      .glass-ui .border-border\\/20,
      .glass-ui .border-border\\/30,
      .glass-ui .border-b {
        border-color: #F0EDE8 !important;
      }
      .glass-ui hr {
        border-color: #F0EDE8 !important;
      }

      /* ---- Scrollbar ---- */
      .glass-ui ::-webkit-scrollbar {
        width: 4px;
      }
      .glass-ui ::-webkit-scrollbar-track {
        background: transparent;
      }
      .glass-ui ::-webkit-scrollbar-thumb {
        background: #E8E4DF;
        border-radius: 4px;
      }
      .glass-ui ::-webkit-scrollbar-thumb:hover {
        background: #D5D0CA;
      }

      /* ---- Mobile sidebar overlay ---- */
      .glass-ui .fixed.inset-0.bg-black\\/50 {
        background: rgba(0, 0, 0, 0.2) !important;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      }

      /* ---- Sheet sidebar on mobile ---- */
      .glass-ui [data-radix-dialog-content].border-r {
        background: #FFFFFF !important;
        border-right: 1px solid #F0EDE8 !important;
      }

      /* ---- Chips/Badges ---- */
      .glass-ui .glass-chip {
        background: #FAF8F5 !important;
        border: 1px solid #F0EDE8;
        border-radius: 10px;
      }

      /* ---- Muted text refinement ---- */
      .glass-ui .text-muted-foreground {
        color: #9B9590 !important;
      }
    `;

    document.head.appendChild(style);

    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  return null;
}
