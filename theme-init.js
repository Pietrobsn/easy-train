(() => {
  try {
    const preference = localStorage.getItem('easy-train-theme-v2') || 'system';
    const theme = preference === 'system'
      ? (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : preference === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.documentElement.style.colorScheme = theme;
  } catch {
    const fallback = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.dataset.theme = fallback;
    document.documentElement.dataset.themePreference = 'system';
    document.documentElement.style.colorScheme = fallback;
  }
})();
