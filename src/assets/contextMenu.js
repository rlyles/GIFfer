document.addEventListener('contextmenu', (event) => {
    console.log('Context menu event triggered');
    event.preventDefault();
    window.electronAPI.showContextMenu();
});