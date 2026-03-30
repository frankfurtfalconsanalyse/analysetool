const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9TePT4iPJvaEyKhGkd1W2ujLGjFp6Ua_qjgTsqcuGmaWYWBPvqW4Xy-ZUXTOtRi_Xs4nI9dJhvDyf/pub?output=csv';

let allVideos = [];

async function loadVideos() {
    const container = document.getElementById('video-container');
    
    try {
        const response = await fetch(SHEET_CSV_URL);
        const data = await response.text();
        
        // Zeilen trennen
        const rows = data.split(/\r?\n/).filter(row => row.trim() !== "");
        
        // Header entfernen (erste Zeile)
        const contentRows = rows.slice(1);

        allVideos = contentRows.map(row => {
            // Erkennt ob Komma oder Semikolon (wichtig für deutsche Google-Accounts)
            const delimiter = row.includes(';') ? ';' : ',';
            const columns = row.split(delimiter);
            
            if (columns.length >= 3) {
                return {
                    title: columns[0].replace(/"/g, '').trim(),
                    category: columns[1].replace(/"/g, '').trim(),
                    link: columns[2].replace(/"/g, '').trim()
                };
            }
            return null;
        }).filter(v => v !== null);

        if (allVideos.length === 0) {
            container.innerHTML = "<p>Keine Videos gefunden. Prüfe, ob die Tabelle Daten enthält.</p>";
        } else {
            displayVideos(allVideos);
        }

    } catch (error) {
        console.error("Fehler:", error);
        container.innerHTML = "<p>Fehler beim Laden der CSV-Daten. Bitte Seite neu laden.</p>";
    }
}

function displayVideos(videos) {
    const container = document.getElementById('video-container');
    container.innerHTML = '';

    videos.forEach(video => {
        const div = document.createElement('div');
        div.className = 'video-card';
        div.onclick = () => openVideo(video);
        
        // Kategorie-Farben
        let catColor = "#e30613"; // Standard rot
        
        div.innerHTML = `
            <div style="font-size: 0.7rem; color: ${catColor}; font-weight: bold; text-transform: uppercase;">${video.category}</div>
            <h3 style="margin: 10px 0;">${video.title}</h3>
            <div class="play-btn">▶ Analyse Video</div>
        `;
        container.appendChild(div);
    });
}

function filterVideos(category) {
    if (category === 'All') {
        displayVideos(allVideos);
    } else {
        const filtered = allVideos.filter(v => v.category.toLowerCase().trim() === category.toLowerCase().trim());
        displayVideos(filtered);
    }
}

function openVideo(video) {
    const modal = document.getElementById('videoModal');
    const iframe = document.getElementById('videoFrame');
    const title = document.getElementById('modalTitle');

    let url = video.link;
    
    // Google Drive Link für den Player umwandeln
    if (url.includes('drive.google.com')) {
        if (url.includes('/view')) {
            url = url.split('/view')[0] + '/preview';
        } else if (url.includes('?id=')) {
            const id = url.split('id=')[1].split('&')[0];
            url = `https://drive.google.com/file/d/${id}/preview`;
        }
    }

    iframe.src = url;
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
