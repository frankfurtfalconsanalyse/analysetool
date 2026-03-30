// ERSETZE DIESEN LINK durch deinen "Als CSV veröffentlicht"-Link aus Google Sheets!
const SHEET_CSV_URL = https://docs.google.com/spreadsheets/d/e/2PACX-1vT9TePT4iPJvaEyKhGkd1W2ujLGjFp6Ua_qjgTsqcuGmaWYWBPvqW4Xy-ZUXTOtRi_Xs4nI9dJhvDyf/pub?output=csv;

let allVideos = [];

async function loadVideos() {
    try {
        const response = await fetch(SHEET_CSV_URL);
        const data = await response.text();
        const rows = data.split('\n').slice(1); // Kopfzeile entfernen

        allVideos = rows.map(row => {
            const columns = row.split(',');
            return {
                title: columns[0],
                category: columns[1],
                link: columns[2] ? columns[2].trim() : ''
            };
        }).filter(v => v.title);

        displayVideos(allVideos);
    } catch (error) {
        console.error("Fehler beim Laden der Videos:", error);
        document.getElementById('video-container').innerHTML = "Fehler beim Laden der Daten.";
    }
}

function displayVideos(videos) {
    const container = document.getElementById('video-container');
    container.innerHTML = '';

    videos.forEach(video => {
        const div = document.createElement('div');
        div.className = 'video-card';
        div.onclick = () => openVideo(video);
        div.innerHTML = `
            <span>${video.category}</span>
            <h3>${video.title}</h3>
            <p>▶ Video abspielen</p>
        `;
        container.appendChild(div);
    });
}

function filterVideos(category) {
    if (category === 'All') {
        displayVideos(allVideos);
    } else {
        const filtered = allVideos.filter(v => v.category.trim() === category);
        displayVideos(filtered);
    }
}

function openVideo(video) {
    const modal = document.getElementById('videoModal');
    const iframe = document.getElementById('videoFrame');
    const title = document.getElementById('modalTitle');

    // Google Drive Link für Embedding umbauen
    let embedUrl = video.link.replace('/view?usp=sharing', '/preview');
    embedUrl = embedUrl.replace('file/d/', 'file/d/'); 

    iframe.src = embedUrl;
    title.innerText = video.title;
    modal.style.display = "block";
}

function closeModal() {
    const modal = document.getElementById('videoModal');
    const iframe = document.getElementById('videoFrame');
    iframe.src = "";
    modal.style.display = "none";
}

window.onload = loadVideos;
