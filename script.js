let storage = [];
let auditedData = [];
let chartStatus = null;

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const btnId = tabId === 'tab-charts' ? 'btn-charts' : tabId === 'tab-table' ? 'btn-table' : 'btn-ai-tab';
    document.getElementById(btnId).classList.add('active');
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    storage = [];
    for (let f of files) {
        const data = await parseFile(f);
        storage.push({ name: f.name, rows: data });
    }
    if (storage.length > 0) processData();
});

async function parseFile(file) {
    return new Promise((resolve) => {
        if (file.name.endsWith('.csv')) {
            Papa.parse(file, { 
                header: true, 
                skipEmptyLines: true, 
                // Detecta automaticamente delimitador ; ou ,
                complete: (res) => resolve(res.data) 
            });
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                const wb = XLSX.read(e.target.result, { type: 'binary' });
                resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
            };
            reader.readAsBinaryString(file);
        }
    });
}

function processData() {
    const base = storage[0].rows;
    const comp = storage[1]?.rows || null;
    const keys = Object.keys(base[0] || {});
    let diffs = 0;

    auditedData = base.map(row => {
        let isDiff = false;
        if (comp) {
            // QA: Procura por Nome ou Matrícula em colunas diferentes
            const id1 = (row.ALUNO || row.NOME_ALUNO || row.CD_MATRICULA || "").toString().trim().toLowerCase();
            const match = comp.find(r => 
                (r.ALUNO || r.NOME_ALUNO || r.CD_MATRICULA || "").toString().trim().toLowerCase() === id1
            );

            if (!match) isDiff = true;
            else {
                const s1 = (row.STATUS || row.SITUACAO_MATRICULA || "").toString().trim();
                const s2 = (match.STATUS || match.SITUACAO_MATRICULA || "").toString().trim();
                if (s1 !== s2) isDiff = true;
            }
        }
        if (isDiff) diffs++;
        return { ...row, _isDiff: isDiff };
    });

    renderTable(keys);
    updateDashboard(auditedData.length, diffs);
}

function renderTable(keys) {
    const tHead = document.getElementById('tableHeader');
    tHead.innerHTML = `<tr>${keys.map(k => `<th>${k}<select class="filter-select" onchange="applyFilters()"><option value="">TUDO</option>${Array.from(new Set(auditedData.map(r => r[k]))).slice(0,10).map(v => `<option value="${v}">${v}</option>`).join('')}</select></th>`).join('')}</tr>`;
    applyFilters();
}

function applyFilters() {
    const mode = document.getElementById('viewFilter').value;
    const selects = document.querySelectorAll('.filter-select');
    const keys = Object.keys(auditedData[0]).filter(k => !k.startsWith('_'));
    
    const filtered = auditedData.filter(row => {
        const matchesMode = mode === 'all' ? true : mode === 'diff' ? row._isDiff : !row._isDiff;
        const matchesCols = Array.from(selects).every((sel, i) => sel.value === "" || String(row[keys[i]]) === sel.value);
        return matchesMode && matchesCols;
    });

    document.getElementById('tableBody').innerHTML = filtered.slice(0, 1000).map(r => `
        <tr class="${r._isDiff ? 'diff-row' : ''}">${keys.map(k => `<td>${r[k] || '---'}</td>`).join('')}</tr>
    `).join('');
}

function updateDashboard(total, diffs) {
    document.getElementById('kpiRows').innerText = total;
    document.getElementById('kpiDiffs').innerText = diffs;
    document.getElementById('kpiStatusText').innerText = diffs > 0 ? "Divergências detectadas entre os períodos." : "Dados 100% correlatos.";
    
    if (chartStatus) chartStatus.destroy();
    chartStatus = new Chart(document.getElementById('chartStatus'), {
        type: 'doughnut',
        data: { datasets: [{ data: [diffs, total-diffs], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }] },
        options: { cutout: '80%' }
    });
}

document.getElementById('btnAi').onclick = async () => {
    const key = document.getElementById('geminiKey').value;
    if (!key) return alert("Insira sua API Key do Gemini.");
    const aiTxt = document.getElementById('aiTxt');
    document.getElementById('aiLoader').classList.remove('hidden');
    switchTab('tab-ai');

    const prompt = `Analise a estrutura: Arquivo 1 colunas: ${Object.keys(storage[0].rows[0]).join(', ')}. Arquivo 2 colunas: ${storage[1] ? Object.keys(storage[1].rows[0]).join(', ') : 'Nenhum'}. Total registros: ${auditedData.length}. Divergências: ${auditedData.filter(r => r._isDiff).length}. Dê o parecer técnico e, se houver erro de relação, diga exatamente o que o usuário deve ajustar no Excel.`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        aiTxt.innerHTML = data.candidates[0].content.parts[0].text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    } catch (e) { aiTxt.innerHTML = "Erro ao gerar parecer técnico."; }
    finally { document.getElementById('aiLoader').classList.add('hidden'); }
};

function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(auditedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "BI_Auditoria.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.autoTable({ html: '#mainTable', theme: 'grid', styles: { fontSize: 7 } });
    doc.save("Relatorio_BI.pdf");
}
