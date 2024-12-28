document.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    window.electronAPI.showContextMenu();
});