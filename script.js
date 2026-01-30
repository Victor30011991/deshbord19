let storage = [];
let auditedData = [];
let charts = {};

function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    const mapping = {'tab-charts': 'btn-charts', 'tab-table': 'btn-table', 'tab-ai': 'btn-ai-tab'};
    document.getElementById(mapping[id]).classList.add('active');
}

document.getElementById('fileInput').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    storage = [];
    for (let f of files) {
        const data = await parseFile(f);
        storage.push({ name: f.name, rows: data });
    }
    if (storage.length > 0) {
        processAudit();
        generateAiReport();
    }
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
    const comp = storage[1]?.rows || null;
    let dCount = 0;

    auditedData = base.map(row => {
        let isDiff = false;
        if (comp) {
            // Normalização de colunas automática [ALUNO vs NOME_ALUNO]
            const id = (row.ALUNO || row.NOME_ALUNO || "").toString().trim().toLowerCase();
            const match = comp.find(r => (r.ALUNO || r.NOME_ALUNO || "").toString().trim().toLowerCase() === id);
            
            if (!match) isDiff = true;
            else {
                const s1 = (row.STATUS || row.SITUACAO_MATRICULA || "").toString().trim();
                const s2 = (match.STATUS || match.SITUACAO_MATRICULA || "").toString().trim();
                if (s1 !== s2) isDiff = true;
            }
        }
        if (isDiff) dCount++;
        return { ...row, _isDiff: isDiff };
    });

    updateDashboard(dCount);
    renderTable();
}

function updateDashboard(diffs) {
    const total = auditedData.length;
    document.getElementById('kpiRows').innerText = total;
    document.getElementById('kpiDiffs').innerText = diffs;
    document.getElementById('kpiEquals').innerText = total - diffs;

    renderChart('chartStatus', 'doughnut', [diffs, total - diffs], ['#f59e0b', '#10b981'], ['Diferenças', 'Iguais']);
    
    const cityData = auditedData.reduce((acc, r) => { const c = r.CIDADE || "Outros"; acc[c] = (acc[c] || 0) + 1; return acc; }, {});
    const topCities = Object.entries(cityData).sort((a,b) => b[1] - a[1]).slice(0, 5);
    renderChart('chartCities', 'bar', topCities.map(c => c[1]), ['#3b82f6'], topCities.map(c => c[0]));

    const statusData = auditedData.reduce((acc, r) => { const s = r.STATUS || "Outros"; acc[s] = (acc[s] || 0) + 1; return acc; }, {});
    renderChart('chartStatusPie', 'pie', Object.values(statusData), ['#6366f1', '#ec4899', '#10b981'], Object.keys(statusData));
}

function renderChart(id, type, data, colors, labels) {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
        type: type,
        data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderWidth: 0 }] },
        options: { plugins: { legend: { display: type !== 'bar', labels: { color: '#94a3b8', font: { size: 9 } } } } }
    });
}

function renderTable() {
    const keys = Object.keys(auditedData[0]).filter(k => !k.startsWith('_'));
    document.getElementById('tableHeader').innerHTML = `<tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr>`;
    applyFilters();
}

function applyFilters() {
    const mode = document.getElementById('viewFilter').value;
    const keys = Object.keys(auditedData[0]).filter(k => !k.startsWith('_'));
    const filtered = auditedData.filter(r => mode === 'all' ? true : (mode === 'diff' ? r._isDiff : !r._isDiff));

    document.getElementById('tableBody').innerHTML = filtered.slice(0, 300).map(r => `
        <tr class="${r._isDiff ? 'diff-row' : ''}">${keys.map(k => `<td>${r[k] || ''}</td>`).join('')}</tr>
    `).join('');
}

async function generateAiReport() {
    const key = document.getElementById('geminiKey').value;
    const aiTxt = document.getElementById('aiTxt');
    
    if (!key) {
        aiTxt.innerHTML = "<b class='text-orange-400'>Aguardando API Key...</b> Insira a chave no topo para gerar o relatório.";
        return;
    }

    document.getElementById('aiLoader').classList.remove('hidden');
    aiTxt.innerHTML = "Cruzando tabelas e gerando parecer...";

    const f1 = Object.keys(storage[0].rows[0]).join(', ');
    const f2 = storage[1] ? Object.keys(storage[1].rows[0]).join(', ') : "Nenhum";
    
    // Prompt de Auditoria Direta
    const prompt = `Analise estes dados de auditoria: 
    - Arquivo 1 colunas: [${f1}]
    - Arquivo 2 colunas: [${f2}]
    - Divergências detectadas: ${auditedData.filter(r => r._isDiff).length} de ${auditedData.length}.

    REGRAS:
    1. Se as colunas de identificação de alunos forem incompatíveis, explique detalhadamente como o usuário deve renomear os cabeçalhos para o sistema funcionar.
    2. Se forem compatíveis, forneça o Parecer das Diferenças, a Análise de Relações e a Conclusão Final sobre a integridade dos dados.`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        aiTxt.innerHTML = data.candidates[0].content.parts[0].text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b class="text-white">$1</b>');
    } catch (e) {
        aiTxt.innerHTML = "Erro na API. Verifique a chave ou sua conexão.";
    } finally {
        document.getElementById('aiLoader').classList.add('hidden');
    }
}

function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(auditedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "BI_Enterprise.xlsx");
}

function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.autoTable({ html: '#mainTable', theme: 'grid', styles: { fontSize: 6 } });
    doc.save("Relatorio_BI.pdf");
}
