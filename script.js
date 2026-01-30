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
    if (storage.length > 0) processAudit();
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

function processAudit() {
    const base = storage[0].rows;
    const comp = storage[1] ? storage[1].rows : null;
    let diffs = 0;

    auditedData = base.map(row => {
        let isDiff = false;
        if (comp) {
            // Busca por NOME ou ALUNO ou MATRÍCULA
            const id = (row.ALUNO || row.NOME_ALUNO || row.CD_MATRICULA || "").toString().trim().toLowerCase();
            const match = comp.find(r => (r.ALUNO || r.NOME_ALUNO || r.CD_MATRICULA || "").toString().trim().toLowerCase() === id);
            
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

    updateUI(diffs);
}

function updateUI(diffCount) {
    const total = auditedData.length;
    document.getElementById('kpiRows').innerText = total;
    document.getElementById('kpiDiffs').innerText = diffCount;
    document.getElementById('kpiEquals').innerText = total - diffCount;

    // Dashboard 1: Acuracidade
    renderChart('chartStatus', 'doughnut', [diffCount, total - diffCount], ['#f59e0b', '#10b981'], ['Diferenças', 'Iguais']);

    // Dashboard 2: Cidades com mais Divergências
    const cities = auditedData.filter(r => r._isDiff).reduce((acc, r) => { 
        const c = r.CIDADE || r.MUNICIPIO_ACAO || "N/A";
        acc[c] = (acc[c] || 0) + 1; return acc; 
    }, {});
    const topCities = Object.entries(cities).sort((a,b) => b[1] - a[1]).slice(0, 5);
    renderChart('chartCities', 'bar', topCities.map(c => c[1]), ['#3b82f6'], topCities.map(c => c[0]));

    // Dashboard 3: Status Pie
    const stats = auditedData.reduce((acc, r) => { 
        const s = r.STATUS || r.SITUACAO_MATRICULA || "Indefinido";
        acc[s] = (acc[s] || 0) + 1; return acc; 
    }, {});
    renderChart('chartStatusPie', 'pie', Object.values(stats), ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'], Object.keys(stats));

    renderTable(Object.keys(auditedData[0]));
}

function renderChart(id, type, data, colors, labels) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
        type: type,
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }] },
        options: { plugins: { legend: { display: type !== 'bar', position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } } }, cutout: '70%' }
    });
}

function renderTable(keys) {
    const headerKeys = keys.filter(k => !k.startsWith('_'));
    document.getElementById('tableHeader').innerHTML = `<tr>${headerKeys.map(k => `<th>${k}<select class="filter-select" onchange="applyFilters()"><option value="">TODOS</option>${Array.from(new Set(auditedData.map(r => r[k]))).slice(0,10).map(v => `<option value="${v}">${v}</option>`).join('')}</select></th>`).join('')}</tr>`;
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

    document.getElementById('tableBody').innerHTML = filtered.slice(0, 400).map(r => `
        <tr class="${r._isDiff ? 'diff-row' : ''}">${keys.map(k => `<td>${r[k] || ''}</td>`).join('')}</tr>
    `).join('');
}

document.getElementById('btnAi').onclick = async () => {
    const key = document.getElementById('geminiKey').value;
    if (!key) return alert("Por favor, insira a Gemini API Key.");
    
    const aiTxt = document.getElementById('aiTxt');
    const loader = document.getElementById('aiLoader');
    loader.classList.remove('hidden');
    switchTab('tab-ai');

    // Validação Estrutural para a IA
    const f1Cols = storage[0] ? Object.keys(storage[0].rows[0]) : [];
    const f2Cols = storage[1] ? Object.keys(storage[1].rows[0]) : [];
    
    const prompt = `
        Aja como um Auditor de Dados. 
        Estrutura atual:
        - Arquivo 1 colunas: [${f1Cols.join(', ')}]
        - Arquivo 2 colunas: [${f2Cols.join(', ')}]
        - Registros: ${auditedData.length}
        - Divergências: ${auditedData.filter(r => r._isDiff).length}

        INSTRUÇÕES:
        1. Se as colunas "ALUNO" ou "NOME_ALUNO" não existirem em ambos, ou se as colunas forem totalmente incompatíveis, PARE a análise e escreva um "GUIA DE CORREÇÃO" para o usuário ajustar o Excel.
        2. Se os dados forem compatíveis, forneça:
           - PARECER DAS DIFERENÇAS: O que mudou e por quê.
           - ANÁLISE DE RELAÇÕES: Como os dados se cruzam.
           - CONCLUSÃO: Um resumo estratégico sobre a integridade do relatório.
    `;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        aiTxt.innerHTML = data.candidates[0].content.parts[0].text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b class="text-white">$1</b>');
    } catch (e) { aiTxt.innerHTML = "Erro na conexão com a IA. Verifique sua chave."; }
    finally { loader.classList.add('hidden'); }
};

function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(auditedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "BI_Auditoria_Export.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.autoTable({ html: '#mainTable', theme: 'grid', styles: { fontSize: 6 } });
    doc.save("Relatorio_Auditoria.pdf");
}
