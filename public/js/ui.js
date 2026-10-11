// public/js/ui.js — Shared UI helpers: toast, modal, sidebar, badges
const UI = {
    /* ── Toast Notifications ── */
    toastContainer: null,

    initToasts() {
        if (!document.getElementById('toast-container')) {
            const c = document.createElement('div');
            c.id = 'toast-container';
            c.className = 'toast-container';
            document.body.appendChild(c);
        }
        this.toastContainer = document.getElementById('toast-container');
    },

    toast(message, type = 'info', duration = 3500) {
        if (!this.toastContainer) this.initToasts();
        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span>
                       <span class="toast-message">${message}</span>`;
        this.toastContainer.appendChild(t);
        setTimeout(() => {
            t.classList.add('removing');
            t.addEventListener('animationend', () => t.remove());
        }, duration);
    },

    success(msg) { this.toast(msg, 'success'); },
    error(msg)   { this.toast(msg, 'error'); },
    info(msg)    { this.toast(msg, 'info'); },
    warning(msg) { this.toast(msg, 'warning'); },

    /* ── Modals ── */
    openModal(id)  { document.getElementById(id)?.classList.remove('hidden'); },
    closeModal(id) { document.getElementById(id)?.classList.add('hidden'); },

    /* ── Sidebar ── */
    initSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;
        // Close on overlay click (mobile)
        document.addEventListener('click', e => {
            if (window.innerWidth <= 768 && sidebar.classList.contains('open')
                && !sidebar.contains(e.target) && !e.target.closest('#sidebar-toggle')) {
                sidebar.classList.remove('open');
            }
        });
        document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
        // Active link
        const current = window.location.pathname;
        sidebar.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('href') === current) link.classList.add('active');
        });
    },

    /* ── Populate User Info in Sidebar ── */
    populateSidebarUser() {
        const user = Auth.getUser();
        if (!user) return;
        const nameEl   = document.getElementById('sidebar-user-name');
        const roleEl   = document.getElementById('sidebar-user-role');
        const avatarEl = document.getElementById('sidebar-avatar');
        if (nameEl)   nameEl.textContent   = user.name;
        if (roleEl)   roleEl.textContent   = user.role;
        if (avatarEl) avatarEl.textContent = user.name?.[0]?.toUpperCase() || 'U';
    },

    /* ── Badge Helper ── */
    badge(status) {
        const s = (status || 'unknown').toLowerCase().replace(/\s+/g, '-');
        return `<span class="badge badge-${s}">${status}</span>`;
    },

    /* ── Rating Stars ── */
    stars(rating, max = 5) {
        let html = '';
        for (let i = 1; i <= max; i++) {
            html += `<span class="star ${i <= Math.round(rating) ? 'filled' : ''}">★</span>`;
        }
        return `<span class="star-rating">${html}</span>`;
    },

    /* ── Format Currency ── */
    rupee(amount) { return `₹${parseFloat(amount || 0).toFixed(2)}`; },

    /* ── Format Date ── */
    formatDate(dt) {
        if (!dt) return '—';
        return new Date(dt).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true
        });
    },

    /* ── Loading state on button ── */
    setLoading(btn, loading, text = '') {
        if (!btn) return;
        if (loading) {
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = `<span class="spinner"></span> ${text || 'Loading...'}`;
            btn.disabled = true;
        } else {
            btn.innerHTML = btn.dataset.originalText || text;
            btn.disabled = false;
        }
    },

    /* ── Empty state HTML ── */
    empty(icon, title, text) {
        return `<div class="empty-state">
          <div class="empty-icon">${icon}</div>
          <div class="empty-title">${title}</div>
          <p class="empty-text">${text}</p>
        </div>`;
    },

    /* ── Confirm Dialog ── */
    confirm(message) { return window.confirm(message); },

    /* ── Init common components ── */
    init() {
        this.initToasts();
        this.initSidebar();
        this.populateSidebarUser();
        // Logout buttons
        document.querySelectorAll('[data-logout]').forEach(btn => {
            btn.addEventListener('click', () => Auth.logout());
        });
    }
};

window.UI = UI;
document.addEventListener('DOMContentLoaded', () => UI.init());
