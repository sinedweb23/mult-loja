import { obterPedidoKitFestaPorId } from '@/app/actions/pedidos-kit-festa'
import { AutoPrint } from '@/components/admin/auto-print'
import {
  FileText,
  User,
  ShoppingCart,
  Star,
  Calendar,
} from 'lucide-react'

function formatPrice(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export default async function ImprimirPedidoKitFestaPage({
  params,
}: {
  params: Promise<{ pedidoId: string }>
}) {
  const { pedidoId } = await params
  const pedido = await obterPedidoKitFestaPorId(pedidoId)

  if (!pedido) {
    return <p>Pedido não encontrado.</p>
  }

  const dataEmissao = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const codigo = `PED${pedido.created_at.slice(0, 10).replace(/-/g, '')}${pedido.id.slice(0, 6)}`

  return (
    <>
      <AutoPrint />
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          html, body { margin: 0; padding: 0; background: #fff !important; }
          body * { visibility: hidden; }
          .print-root, .print-root * { visibility: visible; }
          .print-root { position: absolute; inset: 0; margin: 0; padding: 0; }
        }
        .print-root {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 11px;
          color: #111;
          background: #fff;
          padding: 20px;
          max-width: 210mm;
          margin: 0 auto;
          box-sizing: border-box;
        }
        .print-header { text-align: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #ddd; }
        .print-header h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px 0; }
        .print-header .sub { font-size: 10px; color: #555; }
        .print-section { margin-bottom: 14px; }
        .print-section-title { font-size: 12px; font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
        .print-section-title svg { width: 14px; height: 14px; flex-shrink: 0; }
        .print-grid { display: grid; grid-template-columns: 120px 1fr; gap: 2px 16px; }
        .print-grid .label { font-weight: 600; color: #333; }
        .print-grid .val { color: #111; }
        .status-pill { display: inline-block; padding: 2px 8px; border-radius: 4px; background: #e5e7eb; font-size: 10px; font-weight: 600; text-transform: capitalize; }
        .item-block { margin-bottom: 12px; padding: 10px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb; }
        .item-name { font-size: 13px; font-weight: 600; color: #2563eb; margin-bottom: 6px; }
        .opcionais-block { margin-top: 8px; padding-left: 12px; border-left: 2px solid #e5e7eb; }
        .opcionais-block .print-section-title { font-size: 11px; margin-bottom: 4px; }
        .kit-detalhes { margin-top: 8px; }
        .print-footer { margin-top: 16px; padding-top: 12px; border-top: 1px solid #ddd; text-align: right; }
        .print-footer .total { font-size: 14px; font-weight: 700; }
      `}</style>
      <div className="print-root">
        <header className="print-header">
          <h1>PEDIDO #{pedido.id.slice(0, 8).toUpperCase()}</h1>
          <p className="sub">Sistema de Administração – {dataEmissao}</p>
        </header>

        <section className="print-section">
          <div className="print-section-title">
            <FileText className="w-3.5 h-3.5" />
            Informações do Pedido
          </div>
          <div className="print-grid">
            <span className="label">Número:</span>
            <span className="val">{codigo}</span>
            <span className="label">Código:</span>
            <span className="val">{pedido.id}</span>
            <span className="label">Data:</span>
            <span className="val">
              {new Date(pedido.created_at).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span className="label">Status:</span>
            <span className="val">
              <span className="status-pill">{pedido.status.toLowerCase()}</span>
            </span>
          </div>
        </section>

        <section className="print-section">
          <div className="print-section-title">
            <User className="w-3.5 h-3.5" />
            Aluno
          </div>
          <div className="print-grid">
            <span className="label">Nome:</span>
            <span className="val">
              {pedido.aluno.nome} ({pedido.aluno.prontuario})
            </span>
            <span className="label">Turma:</span>
            <span className="val">{pedido.turma ?? '—'}</span>
          </div>
        </section>

        <section className="print-section">
          <div className="print-section-title">
            <ShoppingCart className="w-3.5 h-3.5" />
            Itens do Pedido
          </div>
          {pedido.itens.map((item) => (
            <div key={item.id} className="item-block">
              <div className="item-name">{item.produto_nome ?? 'Kit Festa'}</div>
              <div className="print-grid">
                <span className="label">Categoria:</span>
                <span className="val">Kit Festa</span>
                <span className="label">Quantidade:</span>
                <span className="val">{item.quantidade}</span>
                <span className="label">Aluno:</span>
                <span className="val">
                  {pedido.aluno.nome} ({pedido.aluno.prontuario})
                </span>
                <span className="label">Turma:</span>
                <span className="val">{pedido.turma ?? '—'}</span>
                <span className="label">Preço unitário:</span>
                <span className="val">{formatPrice(item.preco_unitario)}</span>
                <span className="label">Preço total:</span>
                <span className="val" style={{ fontWeight: 600 }}>
                  {formatPrice(item.subtotal)}
                </span>
              </div>
              {item.variacoes_selecionadas &&
                Object.keys(item.variacoes_selecionadas).length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <span className="label">Variação:</span>{' '}
                    <span className="val">
                      {Object.entries(item.variacoes_selecionadas)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(' • ')}
                    </span>
                  </div>
                )}
              {item.opcionais_selecionados &&
                item.opcionais_selecionados.length > 0 && (
                  <div className="opcionais-block">
                    <div className="print-section-title">
                      <Star className="w-3 h-3" />
                      Opcionais selecionados
                    </div>
                    <div className="print-grid">
                      {item.opcionais_selecionados.map((o: any, i: number) => (
                        <span key={i} className="val" style={{ gridColumn: '1 / -1' }}>
                          {o.nome ?? 'Opcional'}
                          {(o.quantidade ?? 1) > 1 ? ` (${o.quantidade}x)` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              <div className="kit-detalhes">
                <div className="print-section-title">
                  <Calendar className="w-3.5 h-3.5" />
                  Detalhes do Kit Festa
                </div>
                <div className="print-grid">
                  <span className="label">Data:</span>
                  <span className="val">
                    {item.kit_festa_data
                      ? new Date(item.kit_festa_data + 'T12:00:00').toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })
                      : '—'}
                  </span>
                  <span className="label">Horário:</span>
                  <span className="val">
                    {item.kit_festa_horario_inicio && item.kit_festa_horario_fim
                      ? `${item.kit_festa_horario_inicio} às ${item.kit_festa_horario_fim}`
                      : '—'}
                  </span>
                  <span className="label">Tema:</span>
                  <span className="val">{item.tema_festa ?? '—'}</span>
                  <span className="label">Idade:</span>
                  <span className="val">
                    {item.idade_festa != null ? `${item.idade_festa} anos` : '—'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </section>

        <footer className="print-footer">
          <span className="total">VALOR TOTAL: {formatPrice(pedido.total)}</span>
        </footer>
      </div>
    </>
  )
}
