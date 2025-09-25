// MVP: Excel → Dashboard com login simples, mapeamento de colunas e gráficos
// Stack sugerida p/ demo rápido: React + SheetJS (xlsx) + Recharts + jsPDF
// (Opcional) Firebase Auth/Hosting pode ser plugado depois — aqui deixo um login simples
//
// ▶ Como rodar (local):
// 1) npx create-vite mvp-excel-dashboard --template react
// 2) cd mvp-excel-dashboard
// 3) npm i xlsx recharts jspdf dayjs
// 4) Substitua o conteúdo de src/App.jsx por ESTE arquivo
// 5) npm run dev
//
// Obs.: Este é um MVP didático focado na DEMO. Em produção, adicionar:
// - Autenticação real (Firebase Auth) e controle de acesso
// - Persistência (Firestore/PostgreSQL) e storage do arquivo original
// - Validações robustas, LGPD, RLS por empresa, etc.

import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts'
import dayjs from 'dayjs'
import jsPDF from 'jspdf'

export default function App() {
  // Estado de "login" simplificado (mock)
  const [user, setUser] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Upload/parse
  const [rawRows, setRawRows] = useState([]) // linhas brutas do Excel
  const [headers, setHeaders] = useState([])

  // Mapeamento de colunas
  const [idCol, setIdCol] = useState('') // CNPJ/Empresa
  const [dateCol, setDateCol] = useState('')
  const [valueCol, setValueCol] = useState('')
  const [categoryCol, setCategoryCol] = useState('')
  const [productCol, setProductCol] = useState('')
  const [quantityCol, setQuantityCol] = useState('')
  const [unitPriceCol, setUnitPriceCol] = useState('')
  const [stockCol, setStockCol] = useState('')

  // Filtro por empresa
  const [selectedCompany, setSelectedCompany] = useState('')

  // Parse Excel → JSON
  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const data = await file.arrayBuffer()
    const wb = XLSX.read(data)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' })
    setRawRows(json)
    // Extrai headers da primeira linha
    const hdrs = json.length ? Object.keys(json[0]) : []
    setHeaders(hdrs)
    // Sugestões automáticas de mapeamento (heurística simples)
    const lower = (s) => s.toString().toLowerCase()
    setIdCol(hdrs.find(h => /cnpj|empresa|cliente|id/i.test(h)) || '')
    setDateCol(hdrs.find(h => /data|date|competencia|datavenda/i.test(lower(h))) || '')
    setValueCol(hdrs.find(h => /valor|valor_total|valortotal|receita|despesa|amount/i.test(lower(h))) || '')
    setCategoryCol(hdrs.find(h => /categoria|tipo|descrição|descricao|categoria_despesa/i.test(lower(h))) || '')
    setProductCol(hdrs.find(h => /produto|product|item|descricao/i.test(lower(h))) || '')
    setQuantityCol(hdrs.find(h => /quantidade|quantity|qty|qtd/i.test(lower(h))) || '')
    setUnitPriceCol(hdrs.find(h => /valor_unitario|valorunitario|unit_price|preco/i.test(lower(h))) || '')
    setStockCol(hdrs.find(h => /estoque|stock|estoqueAtual/i.test(lower(h))) || '')
  }

  // Normalização leve conforme mapeamento
  const normalized = useMemo(() => {
    if (!rawRows.length || !idCol || !dateCol || !valueCol) return []
    return rawRows.map((r) => {
      const company = String(r[idCol] ?? '').trim()
      const dateRaw = r[dateCol]
      // tenta parsear data
      let dt = dayjs(dateRaw)
      if (!dt.isValid() && typeof dateRaw === 'number') {
        // data do excel como número (serial)
        const excelEpoch = new Date(Math.round((dateRaw - 25569) * 86400 * 1000))
        dt = dayjs(excelEpoch)
      }
      const value = Number(String(r[valueCol]).replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0
      const category = categoryCol ? String(r[categoryCol] ?? '').trim() : '—'
      const product = productCol ? String(r[productCol] ?? '').trim() : '—'
      const quantity = quantityCol ? Number(String(r[quantityCol]).replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0 : 0
      const unitPrice = unitPriceCol ? Number(String(r[unitPriceCol]).replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0 : 0
      const stock = stockCol ? Number(String(r[stockCol]).replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0 : 0
      
      return {
        company,
        date: dt.isValid() ? dt.format('YYYY-MM-DD') : '',
        month: dt.isValid() ? dt.format('YYYY-MM') : '—',
        value,
        category,
        product,
        quantity,
        unitPrice,
        stock,
        __raw: r,
      }
    }).filter(x => x.company && x.date)
  }, [rawRows, idCol, dateCol, valueCol, categoryCol, productCol, quantityCol, unitPriceCol, stockCol])

  // Empresas únicas (para filtro)
  const companies = useMemo(() => {
    const s = new Set(normalized.map(n => n.company))
    return Array.from(s)
  }, [normalized])

  // Dados filtrados por empresa selecionada (multi-tenant lógico)
  const filtered = useMemo(() => {
    const arr = selectedCompany ? normalized.filter(n => n.company === selectedCompany) : normalized
    return arr
  }, [normalized, selectedCompany])

  // KPIs básicos
  const total = useMemo(() => filtered.reduce((acc, n) => acc + n.value, 0), [filtered])
  const totalQuantity = useMemo(() => filtered.reduce((acc, n) => acc + n.quantity, 0), [filtered])
  
  const byMonth = useMemo(() => {
    const map = {}
    filtered.forEach(n => { map[n.month] = (map[n.month] || 0) + n.value })
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, value: Number(v.toFixed(2)) }))
  }, [filtered])
  
  const byCategory = useMemo(() => {
    const map = {}
    filtered.forEach(n => { map[n.category] = (map[n.category] || 0) + n.value })
    return Object.entries(map).map(([name, v]) => ({ name, value: Number(v.toFixed(2)) }))
  }, [filtered])
  
  const byProduct = useMemo(() => {
    const map = {}
    filtered.forEach(n => { 
      map[n.product] = (map[n.product] || 0) + n.value 
    })
    return Object.entries(map)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10) // Top 10 produtos
      .map(([name, v]) => ({ name, value: Number(v.toFixed(2)) }))
  }, [filtered])
  
  const quantityByMonth = useMemo(() => {
    const map = {}
    filtered.forEach(n => { map[n.month] = (map[n.month] || 0) + n.quantity })
    return Object.entries(map).sort(([a],[b]) => a.localeCompare(b)).map(([m, q]) => ({ month: m, quantity: Number(q.toFixed(0)) }))
  }, [filtered])
  
  const stockAnalysis = useMemo(() => {
    const productStock = {}
    filtered.forEach(n => {
      if (!productStock[n.product]) {
        productStock[n.product] = { product: n.product, stock: n.stock, sales: 0 }
      }
      productStock[n.product].sales += n.quantity
    })
    return Object.values(productStock)
      .filter(p => p.stock > 0)
      .sort((a, b) => (a.stock / (a.sales || 1)) - (b.stock / (b.sales || 1)))
      .slice(0, 10)
  }, [filtered])

  // Exportar PDF simples (KPI + gráfico mensal como lista)
  const exportPDF = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    doc.setFontSize(18)
    doc.text('Relatório Financeiro (Demo)', 40, 50)
    doc.setFontSize(12)
    doc.text(`Empresa: ${selectedCompany || 'Todas'}`, 40, 80)
    doc.text(`Registros: ${filtered.length}`, 40, 100)
    doc.text(`Total: R$ ${total.toLocaleString('pt-BR')}`, 40, 120)
    doc.text('Mensal:', 40, 150)
    let y = 170
    byMonth.forEach(m => {
      doc.text(`• ${m.month}: R$ ${m.value.toLocaleString('pt-BR')}`, 50, y)
      y += 18
    })
    doc.save('relatorio-demo.pdf')
  }

  // UI
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Portal Demo – Excel → Dashboard</h1>
          <p className="text-gray-600">Login simples para demonstrar multiempresa.</p>
          <input className="w-full border rounded-xl p-3" placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="w-full border rounded-xl p-3" placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button
            onClick={()=> setUser({ email })}
            className="w-full bg-black text-white rounded-xl py-3"
          >Entrar</button>
          <p className="text-xs text-gray-500">(Em produção, trocar por Firebase Auth.)</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Excel → Dashboard (Demo)</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{user.email}</span>
            <button className="px-3 py-2 rounded-xl border" onClick={()=>setUser(null)}>Sair</button>
          </div>
        </div>

        {/* Upload */}
        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          <h2 className="text-xl font-semibold">1) Envie sua planilha</h2>
          <input 
            type="file" 
            accept=".xlsx,.xls,.csv" 
            onChange={handleFile}
            className="w-full p-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition-colors"
          />
          <p className="text-sm text-gray-600">
            📁 Formatos aceitos: Excel (.xlsx, .xls) ou CSV<br/>
            🔒 Seus dados ficam apenas no seu navegador (100% privado)
          </p>
          {headers.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700 font-medium">✅ Arquivo carregado com sucesso!</p>
              <p className="text-xs text-green-600 mt-1">
                Colunas encontradas: {headers.join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* Configuração de Análises */}
        {headers.length > 0 && (
          <div className="bg-white rounded-2xl shadow p-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">2) Configure suas análises</h2>
              <p className="text-gray-600">Selecione quais dados você quer analisar no dashboard</p>
            </div>

            {/* Campos Obrigatórios */}
            <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
              <h3 className="font-medium text-blue-900 mb-3 flex items-center">
                <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded mr-2">OBRIGATÓRIO</span>
                Dados essenciais para o dashboard
              </h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🏢 Empresa/Loja <span className="text-red-500">*</span>
                  </label>
                  <select 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={idCol}
                    onChange={(e) => setIdCol(e.target.value)}
                  >
                    <option value="">Selecione a coluna...</option>
                    {headers.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📅 Data da venda <span className="text-red-500">*</span>
                  </label>
                  <select 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={dateCol}
                    onChange={(e) => setDateCol(e.target.value)}
                  >
                    <option value="">Selecione a coluna...</option>
                    {headers.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    💰 Valor total <span className="text-red-500">*</span>
                  </label>
                  <select 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    value={valueCol}
                    onChange={(e) => setValueCol(e.target.value)}
                  >
                    <option value="">Selecione a coluna...</option>
                    {headers.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Campos Opcionais */}
            <div className="border border-green-200 rounded-lg p-4 bg-green-50">
              <h3 className="font-medium text-green-900 mb-3 flex items-center">
                <span className="bg-green-600 text-white text-xs px-2 py-1 rounded mr-2">OPCIONAL</span>
                Dados extras para análises mais detalhadas
              </h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📦 Produto/Item
                  </label>
                  <select 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    value={productCol}
                    onChange={(e) => setProductCol(e.target.value)}
                  >
                    <option value="">Não analisar produtos</option>
                    {headers.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  {productCol && (
                    <p className="text-xs text-green-600 mt-1">✅ Vai gerar: Top produtos, ranking</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📊 Quantidade vendida
                  </label>
                  <select 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    value={quantityCol}
                    onChange={(e) => setQuantityCol(e.target.value)}
                  >
                    <option value="">Não analisar quantidade</option>
                    {headers.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  {quantityCol && (
                    <p className="text-xs text-green-600 mt-1">✅ Vai gerar: Evolução de volume</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🏷️ Categoria
                  </label>
                  <select 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    value={categoryCol}
                    onChange={(e) => setCategoryCol(e.target.value)}
                  >
                    <option value="">Não analisar categoria</option>
                    {headers.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  {categoryCol && (
                    <p className="text-xs text-green-600 mt-1">✅ Vai gerar: Distribuição por categoria</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    💵 Valor unitário
                  </label>
                  <select 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    value={unitPriceCol}
                    onChange={(e) => setUnitPriceCol(e.target.value)}
                  >
                    <option value="">Não analisar preço unitário</option>
                    {headers.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  {unitPriceCol && (
                    <p className="text-xs text-green-600 mt-1">✅ Vai gerar: Análise de preços</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📋 Estoque atual
                  </label>
                  <select 
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    value={stockCol}
                    onChange={(e) => setStockCol(e.target.value)}
                  >
                    <option value="">Não analisar estoque</option>
                    {headers.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                  {stockCol && (
                    <p className="text-xs text-green-600 mt-1">✅ Vai gerar: Análise de giro de estoque</p>
                  )}
                </div>
              </div>
            </div>

            {/* Status de configuração */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="flex items-center">
                  {idCol && dateCol && valueCol ? (
                    <span className="text-green-600 font-medium">✅ Configuração válida</span>
                  ) : (
                    <span className="text-red-600 font-medium">⚠️ Preencha os campos obrigatórios</span>
                  )}
                </div>
                <div className="text-sm text-gray-600">
                  {[productCol, quantityCol, categoryCol, unitPriceCol, stockCol].filter(Boolean).length} análises extras selecionadas
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Company Filter & Actions */}
        <div className="bg-white rounded-2xl shadow p-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <label className="text-sm">Empresa:</label>
            <select className="border rounded-xl p-2" value={selectedCompany} onChange={e=>setSelectedCompany(e.target.value)}>
              <option value="">Todas</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button className="px-4 py-2 rounded-xl border" onClick={exportPDF}>Exportar PDF</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid md:grid-cols-5 gap-4">
          <KPI title="Registros" value={filtered.length} />
          <KPI title="Faturamento (R$)" value={total.toLocaleString('pt-BR')} />
          <KPI title="Qtd. Vendida" value={totalQuantity.toLocaleString('pt-BR')} />
          <KPI title="Ticket Médio (R$)" value={filtered.length ? (total / filtered.length).toFixed(2) : '0'} />
          <KPI title="Empresas" value={companies.length} />
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card title="Evolução Mensal - Faturamento">
            <ChartAreaMonthly data={byMonth} />
          </Card>
          <Card title="Top 10 Produtos">
            <ChartPie data={byProduct} />
          </Card>
        </div>
        
        <div className="grid md:grid-cols-2 gap-6">
          <Card title="Evolução Mensal - Quantidade">
            <ChartQuantityMonthly data={quantityByMonth} />
          </Card>
          <Card title="Por Categoria">
            <ChartPie data={byCategory} />
          </Card>
        </div>
        
        {stockAnalysis.length > 0 && (
          <Card title="Análise de Estoque (Produtos com Menor Giro)">
            <ChartStockAnalysis data={stockAnalysis} />
          </Card>
        )}

        {/* Preview opcional */}
        <div className="bg-white rounded-2xl shadow p-5">
          <h3 className="font-semibold mb-2">Prévia (10 linhas)</h3>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  {['Empresa','Data','Produto','Qtd','Valor Unit.','Valor Total','Categoria','Estoque'].map(h => (
                    <th key={h} className="text-left border-b p-2 bg-gray-100 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0,10).map((r,i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{r.company}</td>
                    <td className="p-2">{r.date}</td>
                    <td className="p-2">{r.product}</td>
                    <td className="p-2">{r.quantity}</td>
                    <td className="p-2">R$ {r.unitPrice.toLocaleString('pt-BR')}</td>
                    <td className="p-2">R$ {r.value.toLocaleString('pt-BR')}</td>
                    <td className="p-2">{r.category}</td>
                    <td className="p-2">{r.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Select({ label, value, onChange, options }){
  return (
    <label className="text-sm block">
      <span className="block mb-1 text-gray-700">{label}</span>
      <select className="w-full border rounded-xl p-2" value={value} onChange={e=>onChange(e.target.value)}>
        <option value="">— Selecione —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}

function KPI({ title, value }){
  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  )
}

function Card({ title, children }){
  return (
    <div className="bg-white rounded-2xl shadow p-5">
      <div className="font-semibold mb-3">{title}</div>
      <div style={{height: 280}}>
        {children}
      </div>
    </div>
  )
}

function ChartAreaMonthly({ data }){
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip formatter={(v)=>`R$ ${Number(v).toLocaleString('pt-BR')}`} />
        <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function ChartQuantityMonthly({ data }){
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="month" />
        <YAxis />
        <Tooltip formatter={(v)=>`${Number(v).toLocaleString('pt-BR')} unidades`} />
        <Bar dataKey="quantity" fill="#22c55e" />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ChartStockAnalysis({ data }){
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="product" angle={-45} textAnchor="end" height={80} />
        <YAxis />
        <Tooltip formatter={(v, name)=> {
          if (name === 'stock') return [`${Number(v).toLocaleString('pt-BR')} unidades`, 'Estoque']
          if (name === 'sales') return [`${Number(v).toLocaleString('pt-BR')} vendidas`, 'Vendas']
          return [v, name]
        }} />
        <Bar dataKey="stock" fill="#f59e0b" name="Estoque" />
        <Bar dataKey="sales" fill="#ef4444" name="Vendas" />
      </BarChart>
    </ResponsiveContainer>
  )
}

const COLORS = ['#0ea5e9','#22c55e','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316','#ec4899','#84cc16','#06b6d4']
function ChartPie({ data }){
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip formatter={(v, n)=> [`R$ ${Number(v).toLocaleString('pt-BR')}`, n]} />
        <Pie data={data} dataKey="value" nameKey="name" outerRadius={100}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  )
}
