pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let fullData = [];
let chartRef = null;

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Tratamento de PDF Digital
    if (file.name.endsWith('.pdf')) {
        fullData = await readPDF(file);
    } else {
        fullData = await readExcel(file);
    }
    renderFullInterface(fullData);
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
        text += c.items.map(s => s.str).join(" ") + " ";
    }
    // Alerta de sucesso conforme imagem
    alert("PDF Digital lido com sucesso! O texto bruto está sendo processado.");
    return [{ "Conteúdo do PDF": text.substring(0, 1000) }];
}

function renderFullInterface(data) {
    if (data.length === 0) return;
    const keys = Object.keys(data[0]);
    const tHead = document.getElementById('tableHeader');

    // CRIAÇÃO DOS FILTROS NAS COLUNAS
    tHead.innerHTML = `<tr>${keys.map(k => `
        <th>
            <div class="text-[9px] text-slate-500 uppercase tracking-tighter">${k}</div>
            <select class="filter-select" onchange="applyColumnFilters()">
                <option value="">TODOS</option>
                ${Array.from(new Set(data.map(r => r[k]))).filter(v => v).sort().map(v => `<option value="${v}">${v}</option>`).join('')}
            </select>
        </th>
    `).join('')}</tr>`;

    updateTableRows(data);
}

function updateTableRows(data) {
    const keys = Object.keys(data[0]);
    const tBody = document.getElementById('tableBody');
    tBody.innerHTML = data.map(r => `
        <tr class="${String(r[keys[0]]).includes('TOTAL') ? 'diff-row' : ''}">
            ${keys.map(k => `<td class="${String(r[k]) === 'undefined' ? 'text-red-400' : ''}">${r[k] ?? '---'}</td>`).join('')}
        </tr>
    `).join('');
    
    document.getElementById('kpiRows').innerText = data.length.toLocaleString();
    updateCharts(0, data.length);
}

function applyColumnFilters() {
    const selects = document.querySelectorAll('.filter-select');
    const keys = Object.keys(fullData[0]);
    
    let filtered = fullData.filter(row => {
        return Array.from(selects).every((sel, idx) => {
            return sel.value === "" || String(row[keys[idx]]) === sel.value;
        });
    });
    updateTableRows(filtered);
}

// EXPORTAÇÕES
function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(fullData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados");
    XLSX.writeFile(wb, "Auditoria_BI.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.autoTable({ html: '#mainTable', startY: 20, theme: 'grid', styles: { fontSize: 7 } });
    doc.save("Relatorio_Auditoria.pdf");
}

function updateCharts(d, t) {
    if(chartRef) chartRef.destroy();
    chartRef = new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: { datasets: [{ data: [d, t-d], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }] },
        options: { cutout: '85%' }
    });
}
