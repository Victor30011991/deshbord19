let storage = [];
let auditedData = [];
let charts = {};

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const mapping = {'tab-charts': 'btn-charts', 'tab-table': 'btn-table', 'tab-ai': 'btn-ai-tab'};
    document.getElementById(mapping[tabId]).classList.add('active');
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    storage = [];
    for (let f of files) {
        const data = await parseFile(f);
        storage.push({ name: f.name, rows: data });
    }
    if (storage.length > 0) processFullAudit();
});

async function parseFile(file) {
    return new Promise(resolve => {
        if (file.name.endsWith('.csv')) {
            Papa.parse(file, { header: true, skipEmptyLines: true, complete: res => resolve(res.data) });
        } else {
            const reader = new FileReader();
            reader.onload = e => {
                const wb = XLSX.read(e.target.result, { type: 'binary' });
                resolve(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]));
            };
            reader.readAsBinaryString(file);
        }
    });
}

function processFullAudit() {
    const base = storage[0].rows;
    const comp = storage[1] ? storage[1].rows : null;
    let diffs = 0;

    auditedData = base.map(row => {
        let isDiff = false;
        if (comp) {
            // Busca inteligente por NOME ou ALUNO
            const id = (row.ALUNO || row.NOME_ALUNO || "").toString().trim().toLowerCase();
            const match = comp.find(r => (r.ALUNO || r.NOME_ALUNO || "").toString().trim().toLowerCase() === id);
            
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

    updateDashboard(auditedData, diffs);
    renderTable(Object.keys(base[0] || {}));
}

function updateDashboard(data, diffCount) {
    const total = data.length;
    document.getElementById('kpiRows').innerText = total;
    document.getElementById('kpiDiffs').innerText = diffCount;
    document.getElementById('kpiEquals').innerText = total - diffCount;

    // Chart 1: Acuracidade
    renderChart('chartStatus', 'doughnut', [diffCount, total - diffCount], ['#f59e0b', '#10b981']);

    // Chart 2: Cidades Top 5
    const cities = data.reduce((acc, r) => { acc[r.CIDADE] = (acc[r.CIDADE] || 0) + 1; return acc; }, {});
    const topCities = Object.entries(cities).sort((a,b) => b[1] - a[1]).slice(0, 5);
    renderChart('chartCities', 'bar', topCities.map(c => c[1]), ['#3b82f6'], topCities.map(c => c[0]));

    // Chart 3: Status
    const stats = data.reduce((acc, r) => { const s = r.STATUS || r.SITUACAO_MATRICULA; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
    renderChart('chartStatusPie', 'pie', Object.values(stats), ['#6366f1', '#8b5cf6', '#ec4899'], Object.keys(stats));
}

function renderChart(id, type, data, colors, labels = ['Diferenças', 'Iguais']) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
        type: type,
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }] },
        options: { plugins: { legend: { display: type === 'pie' || type === 'doughnut' } }, cutout: '70%' }
    });
}

function renderTable(keys) {
    const tHead = document.getElementById('tableHeader');
    tHead.innerHTML = `<tr>${keys.map(k => `<th>${k}<select class="filter-select" onchange="applyFilters()"><option value="">TUDO</option>${Array.from(new Set(auditedData.map(r => r[k]))).slice(0,15).map(v => `<option value="${v}">${v}</option>`).join('')}</select></th>`).join('')}</tr>`;
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

    document.getElementById('tableBody').innerHTML = filtered.slice(0, 500).map(r => `
        <tr class="${r._isDiff ? 'diff-row' : ''}">${keys.map(k => `<td>${r[k] || '---'}</td>`).join('')}</tr>
    `).join('');
}

document.getElementById('btnAi').onclick = async () => {
    const key = document.getElementById('geminiKey').value;
    if (!key) return alert("API Key ausente.");
    const aiTxt = document.getElementById('aiTxt');
    document.getElementById('aiLoader').classList.remove('hidden');
    switchTab('tab-ai');

    // Monta o prompt com diagnóstico de coluna
    const prompt = `Analise a estrutura: Arquivo 1 colunas: [${Object.keys(storage[0].rows[0]).join(', ')}]. Arquivo 2: [${storage[1] ? Object.keys(storage[1].rows[0]).join(', ') : 'Nenhum'}]. Se o sistema não conseguiu relacionar os nomes (NOME_ALUNO vs ALUNO), explique ao usuário como ajustar o Excel. Se estiverem relacionados, dê o parecer sobre as divergências encontradas e a solução.`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        aiTxt.innerHTML = data.candidates[0].content.parts[0].text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    } catch (e) { aiTxt.innerHTML = "Erro ao processar o relatório."; }
    finally { document.getElementById('aiLoader').classList.add('hidden'); }
};

function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(auditedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "BI_Enterprise.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.autoTable({ html: '#mainTable', theme: 'grid', styles: { fontSize: 7 } });
    doc.save("BI_Enterprise.pdf");
}
