/**
 * Theme Management Module
 * Handles dark/light theme toggle, system preference detection, and persistence
 */
const ThemeManager = (() => {
    const THEME_KEY = 'diffmaster_theme';

    function init() {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved) {
            apply(saved);
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            apply(prefersDark ? 'dark' : 'light');
        }
        // Listen for system theme changes (non-manual mode only)
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(THEME_KEY)) {
                apply(e.matches ? 'dark' : 'light');
            }
        });
    }

    function toggle() {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'light' ? 'dark' : 'light';
        apply(next);
        localStorage.setItem(THEME_KEY, next);
    }

    function apply(theme) {
        const iconEl = document.getElementById('themeIcon');
        const labelEl = document.getElementById('themeLabel');
        if (theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            if (iconEl) iconEl.textContent = '\uD83C\uDF19'; // 🌙
            if (labelEl) labelEl.textContent = 'Dark';
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (iconEl) iconEl.textContent = '\u2600\uFE0F'; // ☀️
            if (labelEl) labelEl.textContent = 'Light';
        }
    }

    return { init, toggle, apply };
})();