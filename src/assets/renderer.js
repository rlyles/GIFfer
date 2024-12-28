// ===== Global Variables =====
let tagsData = {};
let currentEditingFile = '';
let isDragging = false;

// ===== Utility Functions =====
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.classList.add('show');
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// ===== GIF Display Functions =====
async function fetchAndDisplayGIFs() {
    try {
        tagsData = await window.electronAPI.getTags();
        await displayGIFs(tagsData);

        document.getElementById('search-input').focus();
    } catch (error) {}
}

async function refreshGallery() {
    try {
        const success = await window.electronAPI.refreshGallery();
    } catch (error) {} 
}

async function displayGIFs(data) {
    const gallery = document.getElementById('gif-gallery');
    gallery.innerHTML = '';

    for (const [filename, tags] of Object.entries(data)) {
        const gifDiv = document.createElement('div');
        gifDiv.classList.add('gif-item');

        const imgContainer = document.createElement('div');
        imgContainer.classList.add('gif-image-container');

        const img = document.createElement('img');
        try {
            const gifPath = await window.electronAPI.getGifPath(filename);
            img.src = `file:///${gifPath}`;
            img.alt = filename;
            img.loading = 'lazy';
            img.draggable = true;

            img.addEventListener('dragstart', async (event) => {
                const gifPath = await window.electronAPI.getGifPath(filename);
                event.dataTransfer.setData('DownloadURL', `image/gif:${filename}:file://${gifPath}`);
                event.dataTransfer.setData('text/plain', filename);
                event.dataTransfer.effectAllowed = 'copy';
            });

            img.addEventListener('click', async () => {
                try {
                    const result = await window.electronAPI.copyToClipboard(filename);
                    if (result.success) {
                        showNotification('GIF copied to clipboard!');
                    } else {}
                } catch (error) {}
            });

            img.title = 'Click to copy to clipboard';

            imgContainer.appendChild(img);

            const filenameDiv = document.createElement('div');
            filenameDiv.classList.add('filename');

            const tagsDiv = document.createElement('div');
            tagsDiv.classList.add('tags');

            tags.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.classList.add('tag');
                tagSpan.textContent = tag;
                tagSpan.addEventListener('click', () => {
                    document.getElementById('search-input').value = tag;
                    filterGIFs(tag);
                });
                tagsDiv.appendChild(tagSpan);
            });

            const controlsDiv = document.createElement('div');
            controlsDiv.classList.add('gif-controls');

            const editButton = document.createElement('button');
            editButton.classList.add('edit-button');
            editButton.innerHTML = '<span class="button-icon">✏️</span> Edit Tags';
            editButton.addEventListener('click', () => openEditModal(filename, tags));

            const deleteButton = document.createElement('button');
            deleteButton.classList.add('delete-button');
            deleteButton.innerHTML = '<span class="button-icon">🗑️</span> Delete';
            deleteButton.addEventListener('click', () => deleteGIF(filename));

            gifDiv.appendChild(imgContainer);
            gifDiv.appendChild(filenameDiv);
            gifDiv.appendChild(tagsDiv);
            gifDiv.appendChild(controlsDiv);
            controlsDiv.appendChild(editButton);
            controlsDiv.appendChild(deleteButton);


            gallery.appendChild(gifDiv);

        } catch (error) {}
    }
}

// ===== Delete GIFs =====
async function deleteGIF(filename) {
    if (confirm(`Are you sure you want to delete ${filename}?`)) {
        try {
            const response = await window.electronAPI.deleteGif(filename);
            if (response.success) {
                showNotification('GIF deleted successfully', 'success');
                await fetchAndDisplayGIFs();
            } else {
                showNotification('Error deleting GIF', 'error');
            }
        } catch (error) {}
    }
}

// ===== Search and Filter Functions =====
const searchInput = document.getElementById('search-input');

const filterGIFs = debounce(async (searchTerm) => {
    searchTerm = searchTerm.trim().toLowerCase();
    
    if (searchTerm === '') {
        await displayGIFs(tagsData);
        return;
    }

    const filteredData = Object.entries(tagsData)
        .filter(([filename, tags]) => 
            tags.some(tag => tag.toLowerCase().includes(searchTerm))
        )
        .reduce((obj, [key, value]) => {
            obj[key] = value;
            return obj;
        }, {});

    await displayGIFs(filteredData);
}, 300);

searchInput.addEventListener('input', (e) => filterGIFs(e.target.value));

// ===== Modal Functions =====
const modal = document.getElementById('modal');
const modalContent = document.querySelector('.modal-content');
const closeButton = document.querySelector('.close-button');
const modalTagsInput = document.getElementById('modal-tags-input');
const saveTagsButton = document.getElementById('save-tags-button');

function openEditModal(filename, tags) {
    currentEditingFile = filename;
    document.getElementById('modal-filename').textContent = filename;
    modalTagsInput.value = tags.join(', ');
    modal.style.display = 'block';
    modalTagsInput.focus();
    
    modalTagsInput.onkeydown = async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            await saveTagsButton.click();
        }
    };
}

// Modify the existing event listener in the keyboard shortcuts section
document.addEventListener('keydown', (e) => {

    if (e.key === 'Escape' && modal.style.display === 'block') {
        modal.style.display = 'none';
    }
    
    if (e.key === 'Enter' && 
        document.activeElement !== searchInput && 
        document.activeElement !== modalTagsInput) {
        searchInput.focus();
    }
});

closeButton.onclick = () => {
    modalTagsInput.onkeydown = null;
    modal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target === modal) {
        modalTagsInput.onkeydown = null;
        modal.style.display = 'none';
    }
};

// ===== Event Handlers =====
closeButton.onclick = () => modal.style.display = 'none';

window.onclick = (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

saveTagsButton.addEventListener('click', async () => {
    const newTags = modalTagsInput.value
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);

    if (newTags.length === 0) {
        showNotification('Please enter at least one tag', 'warning');
        return;
    }

    try {
        await window.electronAPI.updateTags({
            filename: currentEditingFile,
            tags: newTags
        });
        modal.style.display = 'none';
        await fetchAndDisplayGIFs();
        showNotification('Tags updated successfully', 'success');
    } catch (error) {}
});

// ===== Button Handlers =====
document.getElementById('reset-button').addEventListener('click', () => {
    searchInput.value = '';
    fetchAndDisplayGIFs();
});

document.getElementById('open-folder-button').addEventListener('click', async () => {
    try {
        await window.electronAPI.openGifsFolder();
    } catch (error) {}
});

document.addEventListener('contextmenu', (e) => {
    const target = e.target;
    if (target.tagName === 'IMG') {
        e.preventDefault();
        window.electronAPI.showContextMenu(target.src);
    }
});

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', (e) => {

    if (e.key === 'Escape' && modal.style.display === 'block') {
        modal.style.display = 'none';
    }
    
    if (e.key === 'Enter' && document.activeElement !== searchInput) {
        searchInput.focus();
    }
});

// ===== Event Listeners =====
window.electronAPI.onTagsUpdated((updatedTags) => {
    tagsData = updatedTags;
    displayGIFs(tagsData);
});

window.electronAPI.onWindowShown(() => {
    document.getElementById('search-input').focus();
});

// ===== Initialize Application =====
fetchAndDisplayGIFs();

// Optional: Add window resize handler for responsive layouts
window.addEventListener('resize', debounce(() => {

    const gallery = document.getElementById('gif-gallery');
    if (window.innerWidth < 768) {
        gallery.classList.add('mobile-layout');
    } else {
        gallery.classList.remove('mobile-layout');
    }
}, 250));