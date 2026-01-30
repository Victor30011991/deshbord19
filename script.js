/* ============================================================
   BI.ENTERPRISE AI - MOTOR DE AUDITORIA (JS COMPLETO)
   ============================================================ */

// Configuração do PDF Worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let storage = []; // Armazena os dados brutos dos arquivos
let currentVisibleData = []; // Dados após cruzamento/auditoria
let chartRef = null;

// 1. ESCUTA DE ARQUIVOS
document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    
    for (let f of files) {
        const data = await readFile(f);
        if (data) storage.push({ name: f.name, content: data });
    }

    if (storage.length > 0) processAuditory();
});

// 2. MOTOR DE LEITURA (Excel, CSV e PDF)
async function readFile(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            reader.onload = (e) => {
                const workbook = XLSX.read(e.target.result, { type: 'binary' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(sheet));
            };
            reader.readAsBinaryString(file);
        } 
        else if (file.name.endsWith('.csv')) {
            // PapaParse detecta automaticamente se é vírgula ou ponto e vírgula
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (res) => resolve(res.data)
            });
        }
        else if (file.name.endsWith('.pdf')) {
            readPDF(file).then(resolve);
        }
    });
}

// 3. EXTRAÇÃO DE PDF DIGITAL
async function readPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(s => s.str).join(" ") + " ";
    }
    return [{ "Origem": "PDF", "Conteúdo": text.substring(0, 500) }];
}

// 4. LÓGICA DE AUDITORIA E CRUZAMENTO
function processAuditory() {
    const base = storage[0].content;
    const comp = storage[1] ? storage[1].content : null;
    const keys = Object.keys(base[0] || {});
    let diffCount = 0;

    const audited = base.map((row, i) => {
        let isDiff = false;
        let auditedRow = { ...row };

        if (comp) {
            // Tenta encontrar o aluno no segundo arquivo (por nome ou matrícula)
            const match = comp.find(r => 
                (r.NOME_ALUNO && r.NOME_ALUNO === row.ALUNO) || 
                (r.CD_MATRICULA && String(r.CD_MATRICULA) === String(row.CD_MATRICULA))
            );

            if (!match) {
                isDiff = true;
            } else {
                // Compara se o Status mudou
                if (String(row.STATUS || row.SITUACAO_MATRICULA) !== String(match.STATUS || match.SITUACAO_MATRICULA)) {
                    isDiff = true;
                    auditedRow._statusComp = `${row.STATUS || 'Ø'} ⮕ ${match.STATUS || 'Ø'}`;
                }
            }
        }

        if (isDiff) diffCount++;
        return { ...auditedRow, _isDiff: isDiff };
    });

    currentVisibleData = audited;
    renderTable(audited, keys, diffCount);
}

// 5. RENDERIZAÇÃO E FILTROS DE COLUNA
function renderTable(data, keys, dCount) {
    const tHead = document.getElementById('tableHeader');
    
    // Cria os cabeçalhos com os Selects de Filtro
    tHead.innerHTML = `<tr>${keys.map(k => `
        <th>
            <div class="text-[9px] text-slate-500 mb-1 uppercase">${k}</div>
            <select class="filter-select" onchange="applyFilters()">
                <option value="">TUDO</option>
                ${Array.from(new Set(storage[0].content.map(r => r[k]))).filter(v => v).slice(0, 50).map(v => `<option value="${v}">${v}</option>`).join('')}
            </select>
        </th>
    `).join('')}</tr>`;

    applyFilters(); 
    updateDashboard(data.length, dCount);
}

// 6. APLICAÇÃO DE FILTROS (Visualização e Colunas)
function applyFilters() {
    const viewMode = document.getElementById('viewFilter').value; // 'all', 'diff', 'equal'
    const selects = document.querySelectorAll('.filter-select');
    const keys = Object.keys(storage[0].content[0]);
    const tBody = document.getElementById('tableBody');

    const filtered = currentVisibleData.filter(row => {
        const matchesView = viewMode === 'all' || (viewMode === 'diff' ? row._isDiff : !row._isDiff);
        const matchesCols = Array.from(selects).every((sel, idx) => {
            return sel.value === "" || String(row[keys[idx]]) === sel.value;
        });
        return matchesView && matchesCols;
    });

    tBody.innerHTML = filtered.slice(0, 1000).map(r => `
        <tr class="${r._isDiff ? 'diff-row' : ''}">
            ${keys.map(k => `<td>${r[k] ?? '---'}</td>`).join('')}
        </tr>
    `).join('');
}

// 7. EXPORTAÇÃO (BAIXA O QUE ESTÁ FILTRADO)
function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(currentVisibleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "Relatorio_BI.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.autoTable({ html: '#mainTable', theme: 'grid', styles: { fontSize: 6 } });
    doc.save("Relatorio_Auditoria.pdf");
}

// 8. GRÁFICOS
function updateDashboard(total, diffs) {
    document.getElementById('kpiRows').innerText = total.toLocaleString();
    document.getElementById('kpiDiffs').innerText = diffs.toLocaleString();
    document.getElementById('kpiAcc').innerText = total > 0 ? ((total - diffs) / total * 100).toFixed(1) + "%" : "0%";

    if(chartRef) chartRef.destroy();
    const ctx = document.getElementById('statusChart').getContext('2d');
    chartRef = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [diffs, total - diffs],
                backgroundColor: ['#f59e0b', '#10b981'],
                borderWidth: 0
            }]
        },
        options: { cutout: '85%', plugins: { legend: { display: false } } }
    });
}
