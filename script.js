// Configuração do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let storage = [];
let chartRef = null;

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (let f of files) {
        const data = f.name.endsWith('.pdf') ? await readPDF(f) : await readExcel(f);
        storage.push(data);
    }
    
    if (storage.length >= 2) processComparison();
    else if (storage.length === 1) render(storage[0], Object.keys(storage[0][0] || {}), 0);
});

async function readExcel(f) {
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf);
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
}

async function readPDF(f) {
    const buf = await f.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({data: buf}).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const p = await pdf.getPage(i);
        const c = await p.getTextContent();
        text += c.items.map(s => s.str).join(" ");
    }
    // Retorna como objeto para compatibilidade
    return [{ "Origem": "PDF", "Conteudo": text.substring(0, 100) }];
}

function processComparison() {
    const t1 = storage[0];
    const t2 = storage[1];
    const keys = Object.keys(t1[0] || {});
    let diffs = 0;

    // Lógica para evitar "undefined"
    const finalData = t1.map((row, i) => {
        const row2 = t2[i] || {};
        let rowDiff = false;
        let compared = {};

        keys.forEach(k => {
            const v1 = String(row[k] || '').trim();
            const v2 = String(row2[k] || '').trim();
            
            if (v1 !== v2 && storage.length > 1) {
                rowDiff = true;
                compared[k] = `${v1} ⮕ ${v2 || 'Ø'}`;
            } else {
                compared[k] = v1;
            }
        });
        if (rowDiff) diffs++;
        return { ...compared, _error: rowDiff };
    });

    render(finalData, keys, diffs);
}

function render(data, keys, dCount) {
    const total = data.length;
    document.getElementById('kpiRows').innerText = total;
    document.getElementById('kpiDiffs').innerText = dCount;
    document.getElementById('kpiAcc').innerText = total > 0 ? ((total - dCount) / total * 100).toFixed(1) + "%" : "0%";

    document.getElementById('tHead').innerHTML = `<tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    document.getElementById('tBody').innerHTML = data.slice(0, 500).map(r => `
        <tr class="${r._error ? 'diff-row' : ''}">
            ${keys.map(k => `<td class="${String(r[k]).includes('⮕') ? 'text-orange-500' : ''}">${r[k]}</td>`).join('')}
        </tr>
    `).join('');

    updateChart(dCount, total);
}

function updateChart(d, t) {
    if(chartRef) chartRef.destroy();
    chartRef = new Chart(document.getElementById('mainChart'), {
        type: 'doughnut',
        data: { datasets: [{ data: [d, t-d], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }] },
        options: { cutout: '85%' }
    });
}
