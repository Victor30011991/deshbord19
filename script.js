let storage = [];
let auditedData = [];
let chartStatus = null;

// Navegação entre abas
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

// Leitura de Arquivos (CSV, XLSX)
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
                dynamicTyping: true,
                complete: (results) => resolve(results.data)
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

// Lógica de Comparação Q.A.
function processData() {
    const base = storage[0].rows;
    const comp = storage[1] ? storage[1].rows : null;
    const keys = Object.keys(base[0] || {});
    let diffs = 0;

    auditedData = base.map(row => {
        let isDiff = false;
        let diffDetail = "";

        if (comp) {
            // Busca cruzada: ALUNO (Janeiro) vs NOME_ALUNO (Dezembro)
            const id1 = (row.ALUNO || row.NOME_ALUNO || "").toString().trim();
            const match = comp.find(r => (r.ALUNO || r.NOME_ALUNO || "").toString().trim() === id1);

            if (!match) {
                isDiff = true;
                diffDetail = "Não encontrado no arquivo de comparação";
            } else {
                const s1 = (row.STATUS || row.SITUACAO_MATRICULA || "").toString();
                const s2 = (match.STATUS || match.SITUACAO_MATRICULA || "").toString();
                if (s1 !== s2) {
                    isDiff = true;
                    diffDetail = `Status alterado: ${s1} ⮕ ${s2}`;
                }
            }
        }
        if (isDiff) diffs++;
        return { ...row, _isDiff: isDiff, _detail: diffDetail };
    });

    renderTable(keys);
    updateDashboard(auditedData.length, diffs);
}

// Renderização e Filtros de Seta
function renderTable(keys) {
    const tHead = document.getElementById('tableHeader');
    tHead.innerHTML = `<tr>${keys.map(k => `
        <th>
            ${k}
            <select class="filter-select" onchange="applyFilters()">
                <option value="">TUDO</option>
                ${Array.from(new Set(auditedData.map(r => r[k]))).slice(0, 15).map(v => `<option value="${v}">${v}</option>`).join('')}
            </select>
        </th>
    `).join('')}</tr>`;
    applyFilters();
}

function applyFilters() {
    const mode = document.getElementById('viewFilter').value;
    const selects = document.querySelectorAll('.filter-select');
    const keys = Object.keys(auditedData[0]).filter(k => !k.startsWith('_'));
    
    const filtered = auditedData.filter(row => {
        const matchesMode = mode === 'all' || (mode === 'diff' ? row._isDiff : !row._isDiff);
        const matchesCols = Array.from(selects).every((sel, i) => sel.value === "" || String(row[keys[i]]) === sel.value);
        return matchesMode && matchesCols;
    });

    document.getElementById('tableBody').innerHTML = filtered.slice(0, 500).map(r => `
        <tr class="${r._isDiff ? 'diff-row' : ''}">
            ${keys.map(k => `<td>${r[k] || '---'}</td>`).join('')}
        </tr>
    `).join('');
}

// Gráficos e KPIs
function updateDashboard(total, diffs) {
    document.getElementById('kpiRows').innerText = total.toLocaleString();
    document.getElementById('kpiDiffs').innerText = diffs.toLocaleString();
    document.getElementById('kpiAcc').innerText = total > 0 ? ((total - diffs) / total * 100).toFixed(1) + "%" : "0%";

    if (chartStatus) chartStatus.destroy();
    chartStatus = new Chart(document.getElementById('chartStatus'), {
        type: 'doughnut',
        data: { datasets: [{ data: [diffs, total - diffs], backgroundColor: ['#f59e0b', '#10b981'], borderWidth: 0 }] },
        options: { cutout: '85%' }
    });
}

// Integração com IA Gemini
document.getElementById('btnAi').onclick = async () => {
    const key = document.getElementById('geminiKey').value;
    if (!key) return alert("Insira a chave da API!");

    const aiTxt = document.getElementById('aiTxt');
    const status = document.getElementById('aiStatus');
    
    status.classList.remove('hidden');
    aiTxt.innerHTML = "Processando parecer técnico...";
    switchTab('tab-ai');

    const prompt = `Analise os dados de auditoria: Total ${auditedData.length}, Divergências ${auditedData.filter(r => r._isDiff).length}. Gere um relatório com resumo, análise das divergências encontradas nos arquivos de produção e uma conclusão com solução técnica.`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
            method: 'POST',
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        aiTxt.innerHTML = data.candidates[0].content.parts[0].text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    } catch (e) {
        aiTxt.innerHTML = "Erro ao conectar com a IA.";
    } finally {
        status.classList.add('hidden');
    }
};

function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(auditedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, "BI_Enterprise_Auditoria.xlsx");
}
