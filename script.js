/* script.js - Lógica de Auditoria e PDF */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let dataFiles = [];
let auditChart = null;

// Carregamento de Arquivos
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (let f of files) {
        const data = f.name.endsWith('.pdf') ? await readPDF(f) : await readExcel(f);
        dataFiles.push(data);
    }
    processData();
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
    // Cria objeto simulado para o dashboard
    return [{ "Origem": "PDF Digital", "Conteúdo": text.substring(0, 100) + "..." }];
}

function processData() {
    if (dataFiles.length === 0) return;
    
    const base = dataFiles[0];
    const compare = dataFiles[1] || [];
    const keys = Object.keys(base[0] || {});
    let diffsFound = 0;

    const auditResults = base.map((row, i) => {
        const row2 = compare[i] || {};
        let isDiff = false;
        let finalRow = {};

        keys.forEach(k => {
            const v1 = String(row[k] || '').trim();
            const v2 = String(row2[k] || '').trim();
            
            // Lógica de Diferenciação Laranja
            if (dataFiles.length > 1 && v1 !== v2) {
                isDiff = true;
                finalRow[k] = `${v1} ⮕ ${v2 || 'Ø'}`;
            } else {
                finalRow[k] = v1;
            }
        });

        if (isDiff) diffsFound++;
        return { ...finalRow, _isError: isDiff };
    });

    renderDashboard(auditResults, keys, diffsFound);
}

function renderDashboard(data, keys, dCount) {
    const total = data.length;
    document.getElementById('kpiRows').innerText = total.toLocaleString();
    document.getElementById('kpiDiffs').innerText = dCount.toLocaleString();
    document.getElementById('kpiAcc').innerText = total > 0 ? ((total - dCount) / total * 100).toFixed(1) + "%" : "0%";

    // Tabela
    document.getElementById('tableHeader').innerHTML = `<tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    document.getElementById('tableBody').innerHTML = data.slice(0, 500).map(r => `
        <tr class="${r._isError ? 'diff-row' : ''}">
            ${keys.map(k => `<td class="${String(r[k]).includes('⮕') ? 'text-orange-500' : ''}">${r[k]}</td>`).join('')}
        </tr>
    `).join('');

    updateCharts(dCount, total);
}

function updateCharts(d, t) {
    if(auditChart) auditChart.destroy();
    auditChart = new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: { datasets: [{ data: [d, t-d], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }] },
        options: { cutout: '85%', plugins: { legend: { display: false } } }
    });
}

// Filtro de Busca
document.getElementById('globalSearch').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#tableBody tr');
    rows.forEach(r => {
        r.style.display = r.innerText.toLowerCase().includes(term) ? '' : 'none';
    });
});

// Botão de IA (Simulação de Análise)
document.getElementById('btnAi').onclick = () => {
    const box = document.getElementById('aiResponse');
    box.classList.remove('hidden');
    document.getElementById('aiTxt').innerText = "Analisando 4.084 registros... Identificadas falhas de formatação na coluna 'Potência' em 12% dos casos.";
};
