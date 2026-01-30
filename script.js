pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let allFilesData = [];
let chartDonut = null;
let chartBar = null;

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (let f of files) {
        const data = f.name.endsWith('.pdf') ? await readPDF(f) : await readExcel(f);
        allFilesData.push(data);
    }
    processAll();
});

async function readExcel(f) {
    const b = await f.arrayBuffer();
    const wb = XLSX.read(b);
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
}

async function readPDF(f) {
    const b = await f.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: b}).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        const c = await p.getTextContent();
        text += c.items.map(s => s.str).join(" ");
    }
    return [{ "Conteúdo PDF": text.substring(0, 100) }];
}

function processAll() {
    if (allFilesData.length === 0) return;
    
    const base = allFilesData[0];
    const comp = allFilesData[1] || [];
    const keys = Object.keys(base[0] || {});
    let diffs = 0;

    const results = base.map((row, i) => {
        const row2 = comp[i] || {};
        let isDiff = false;
        let compared = {};

        keys.forEach(k => {
            const v1 = String(row[k] || '').trim();
            const v2 = String(row2[k] || '').trim();
            if (allFilesData.length > 1 && v1 !== v2) {
                isDiff = true;
                compared[k] = `${v1} ⮕ ${v2 || 'Ø'}`;
            } else { compared[k] = v1; }
        });
        if (isDiff) diffs++;
        return { ...compared, _error: isDiff };
    });

    renderUI(results, keys, diffs);
}

function renderUI(data, keys, dCount) {
    const total = data.length;
    document.getElementById('kpiRows').innerText = total;
    document.getElementById('kpiDiffs').innerText = dCount;
    document.getElementById('kpiAcc').innerText = total > 0 ? ((total - dCount) / total * 100).toFixed(1) + "%" : "0%";

    // Render Tabela
    document.getElementById('tHead').innerHTML = `<tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    document.getElementById('tBody').innerHTML = data.map(r => `
        <tr class="${r._error ? 'diff-row' : ''}">
            ${keys.map(k => `<td class="${String(r[k]).includes('⮕') ? 'text-orange' : ''}">${r[k]}</td>`).join('')}
        </tr>
    `).join('');

    updateCharts(dCount, total);
}

function updateCharts(d, t) {
    if(chartDonut) chartDonut.destroy();
    chartDonut = new Chart(document.getElementById('chartStatus'), {
        type: 'doughnut',
        data: { datasets: [{ data: [d, t-d], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }] },
        options: { cutout: '85%' }
    });
}

// FILTRO DE BUSCA RÁPIDA
document.getElementById('searchTable').addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#tBody tr');
    rows.forEach(r => {
        r.style.display = r.innerText.toLowerCase().includes(val) ? '' : 'none';
    });
});
