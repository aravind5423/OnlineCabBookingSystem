// public/js/api.js — Centralized Fetch/AJAX client
const API_BASE = '';  // same origin

const API = {
    /**
     * Make an HTTP request via Fetch
     * @param {string} method
     * @param {string} endpoint
     * @param {object|null} body
     * @returns {Promise<object>}
     */
    async request(method, endpoint, body = null) {
        const token = localStorage.getItem('cab_token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const options = { method, headers };
        if (body && method !== 'GET') options.body = JSON.stringify(body);

        try {
            const res = await fetch(API_BASE + endpoint, options);

            // Token expired or unauthorized
            if (res.status === 401) {
                Auth.clearSession();
                window.location.href = '/login.html';
                return { success: false, message: 'Session expired' };
            }

            const data = await res.json();
            return data;
        } catch (err) {
            console.error('[API] Request failed:', err);
            return { success: false, message: 'Network error. Please check your connection.' };
        }
    },

    get:    (url, params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return API.request('GET', qs ? `${url}?${qs}` : url);
    },
    post:   (url, body) => API.request('POST', url, body),
    put:    (url, body) => API.request('PUT', url, body),
    delete: (url, body) => API.request('DELETE', url, body),
};

window.API = API;
