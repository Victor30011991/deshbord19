pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let storage = [];
let chartRef = null;
let currentVisibleData = [];

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    for (let f of files) {
        const data = f.name.endsWith('.pdf') ? await readPDF(f) : await readExcel(f);
        storage.push(data);
    }
    processAuditory();
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
    return [{ "Conteudo_PDF": text.substring(0, 500) }];
}

function processAuditory() {
    if (storage.length === 0) return;
    const base = storage[0];
    const comp = storage[1] || [];
    const keys = Object.keys(base[0] || {});
    let diffCount = 0;

    const result = base.map((row, i) => {
        const row2 = comp[i] || {};
        let isDiff = false;
        let diffObj = {};

        keys.forEach(k => {
            const v1 = String(row[k] || '').trim();
            const v2 = String(row2[k] || '').trim();
            if (storage.length > 1 && v1 !== v2) {
                isDiff = true;
                diffObj[k] = `${v1} ⮕ ${v2 || 'Ø'}`;
            } else {
                diffObj[k] = v1;
            }
        });
        if (isDiff) diffCount++;
        return { ...diffObj, _isDiff: isDiff };
    });

    currentVisibleData = result;
    renderTable(result, keys, diffCount);
}

function renderTable(data, keys, dCount) {
    const tHead = document.getElementById('tableHeader');
    tHead.innerHTML = `<tr>${keys.map(k => `<th>${k}<select class="filter-select" onchange="applyFilters()"><option value="">TUDO</option>${Array.from(new Set(storage[0].map(r => r[k]))).map(v => `<option value="${v}">${v}</option>`).join('')}</select></th>`).join('')}</tr>`;
    
    applyFilters(); // Aplica visualização inicial
    updateKPIs(data.length, dCount);
}

function applyFilters() {
    const view = document.getElementById('viewFilter').value;
    const selects = document.querySelectorAll('.filter-select');
    const keys = Object.keys(storage[0][0]);
    const tBody = document.getElementById('tableBody');

    let filtered = currentVisibleData.filter(row => {
        const matchesView = view === 'all' || (view === 'diff' ? row._isDiff : !row._isDiff);
        const matchesCols = Array.from(selects).every((sel, idx) => sel.value === "" || String(row[keys[idx]]).includes(sel.value));
        return matchesView && matchesCols;
    });

    tBody.innerHTML = filtered.map(r => `<tr class="${r._isDiff ? 'diff-row' : ''}">${keys.map(k => `<td>${r[k]}</td>`).join('')}</tr>`).join('');
}

function updateKPIs(total, diffs) {
    document.getElementById('kpiRows').innerText = total;
    document.getElementById('kpiDiffs').innerText = diffs;
    document.getElementById('kpiAcc').innerText = total > 0 ? ((total - diffs) / total * 100).toFixed(1) + "%" : "0%";
    
    if(chartRef) chartRef.destroy();
    chartRef = new Chart(document.getElementById('statusChart'), {
        type: 'doughnut',
        data: { datasets: [{ data: [diffs, total-diffs], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }] },
        options: { cutout: '85%' }
    });
}

function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(currentVisibleData.filter(r => {
        // Logica para exportar apenas o que o filtro de visualização permite
        const view = document.getElementById('viewFilter').value;
        return view === 'all' || (view === 'diff' ? r._isDiff : !r._isDiff);
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "BI_Enterprise_Filtro.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.autoTable({ html: '#mainTable', theme: 'grid', styles: { fontSize: 7 } });
    doc.save("Relatorio_Filtrado.pdf");
}
