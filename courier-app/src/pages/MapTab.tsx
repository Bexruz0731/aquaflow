import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Phone, CheckSquare, Square, MapPin } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import api from '@/api/client'
import type { ActiveOrder } from '@/types'

declare global {
  interface Window {
    ymaps: {
      ready: (cb: () => void) => void
      Map: new (el: HTMLElement, opts: object) => YMap
      Placemark: new (coords: number[], props: object, opts: object) => unknown
      multiRouter: {
        MultiRoute: new (params: object, opts: object) => unknown
      }
    }
  }
}

interface YMap {
  geoObjects: { add: (obj: unknown) => void; removeAll: () => void }
  setCenter: (coords: number[], zoom?: number, opts?: object) => void
  setBounds: (bounds: number[][], opts?: object) => void
  destroy: () => void
}

function formatMoney(n: number) { return `${n.toLocaleString('uz-UZ')} so'm` }
function formatTime(s: string) {
  return new Date(s).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  focusOrder?: ActiveOrder | null
  onClearFocus?: () => void
}

export default function MapTab({ focusOrder, onClearFocus }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const ymapRef = useRef<YMap | null>(null)
  const routeActiveRef = useRef(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const posMarkRef = useRef<any>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [ymapsLoaded, setYmapsLoaded] = useState(!!window.ymaps)
  const [myPos, setMyPos] = useState<[number, number] | null>(null)
  const [routeStatus, setRouteStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  const { data } = useQuery({
    queryKey: ['courier-orders'],
    queryFn: async () => {
      const { data } = await api.get('/orders/courier/active')
      return data as { orders: ActiveOrder[] }
    },
    staleTime: 30000,
  })

  const orders = data?.orders ?? []

  // Watch position — first callback fires fast, no need for separate getCurrentPosition
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!myPos) setMyPos([41.2995, 69.2401]) // fallback if denied/timeout
    }, 6000)
    const watch = navigator.geolocation.watchPosition(
      pos => { clearTimeout(timer); setMyPos([pos.coords.latitude, pos.coords.longitude]) },
      () => { clearTimeout(timer); setMyPos([41.2995, 69.2401]) },
      { enableHighAccuracy: true, timeout: 8000 }
    )
    return () => { navigator.geolocation.clearWatch(watch); clearTimeout(timer) }
  }, [])

  // Load Yandex Maps script
  useEffect(() => {
    if (window.ymaps) { setYmapsLoaded(true); return }
    const apiKey = import.meta.env.VITE_YANDEX_MAPS_KEY ?? ''
    const script = document.createElement('script')
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU&load=package.full`
    script.async = true
    script.onload = () => setYmapsLoaded(true)
    document.head.appendChild(script)
  }, [])

  // Init map once we have both ymaps and position
  useEffect(() => {
    if (!ymapsLoaded || !mapRef.current || !myPos || ymapRef.current) return
    window.ymaps.ready(() => {
      if (!mapRef.current || ymapRef.current) return
      ymapRef.current = new window.ymaps.Map(mapRef.current, {
        center: myPos,
        zoom: 14,
        controls: ['zoomControl'],
      })
      // draw initial markers
      drawMarkers(myPos, new Set(), orders)
    })
  }, [ymapsLoaded, myPos !== null])

  // Draw only markers (called automatically on selection/position change)
  const drawMarkers = useCallback((pos: [number, number], ids: Set<string>, allOrders: ActiveOrder[]) => {
    const map = ymapRef.current
    if (!map || !window.ymaps) return
    map.geoObjects.removeAll()
    posMarkRef.current = null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const posMark: any = new window.ymaps.Placemark(
      pos,
      { hintContent: 'Sizning joylashuvingiz' },
      { preset: 'islands#blueCircleDotIcon' }
    )
    posMarkRef.current = posMark
    map.geoObjects.add(posMark)

    allOrders.forEach((order, idx) => {
      if (!order.latitude || !order.longitude) return
      const isSel = ids.has(String(order.id))
      map.geoObjects.add(new window.ymaps.Placemark(
        [order.latitude, order.longitude],
        {
          balloonContentHeader: `#${order.order_number}`,
          balloonContentBody: `${order.client_name}<br/>${formatMoney(order.total_amount)}`,
          hintContent: `#${order.order_number}`,
          iconContent: `${idx + 1}`,
        },
        { preset: isSel ? 'islands#redStretchyIcon' : 'islands#blueStretchyIcon' }
      ))
    })
  }, [])

  // Build route (called only on button press)
  const buildRoute = useCallback((pos: [number, number], ids: Set<string>, allOrders: ActiveOrder[]) => {
    const map = ymapRef.current
    if (!map || !window.ymaps) return

    drawMarkers(pos, ids, allOrders)

    const sel = allOrders.filter(o => ids.has(String(o.id)) && o.latitude && o.longitude)
    if (sel.length === 0) return

    if (!window.ymaps.multiRouter) {
      setRouteStatus('error')
      return
    }

    const points: [number, number][] = [
      pos,
      ...sel.map(o => [o.latitude!, o.longitude!] as [number, number]),
    ]

    routeActiveRef.current = true
    setRouteStatus('loading')
    const route = new window.ymaps.multiRouter.MultiRoute(
      { referencePoints: points },
      { routeActiveStrokeColor: '#2563eb', routeActiveStrokeWidth: 5, wayPointVisible: false, boundsAutoApply: true }
    ) as { model: { events: { add: (ev: string, cb: () => void) => void } } }
    route.model.events.add('requestsuccess', () => setRouteStatus('idle'))
    route.model.events.add('requesterror', () => { routeActiveRef.current = false; setRouteStatus('error') })
    map.geoObjects.add(route as unknown)

    const lats = points.map(p => p[0])
    const lons = points.map(p => p[1])
    if (Math.abs(Math.max(...lats) - Math.min(...lats)) > 0.001 || Math.abs(Math.max(...lons) - Math.min(...lons)) > 0.001) {
      map.setBounds(
        [[Math.min(...lats) - 0.005, Math.min(...lons) - 0.005],
         [Math.max(...lats) + 0.005, Math.max(...lons) + 0.005]],
        { checkZoomRange: true, zoomMargin: 60 }
      )
    }
  }, [drawMarkers])

  // Auto-redraw markers on selection/orders change; on GPS update — only move position dot
  useEffect(() => {
    if (!myPos || !ymapRef.current) return
    if (routeActiveRef.current) {
      // Route is active — just move the position dot, don't touch the route
      if (posMarkRef.current?.geometry) {
        posMarkRef.current.geometry.setCoordinates(myPos)
      }
      return
    }
    drawMarkers(myPos, selectedIds, orders)
  }, [selectedIds, orders, myPos])

  // Auto-focus on focusOrder
  useEffect(() => {
    if (focusOrder) {
      setSelectedIds(new Set([String(focusOrder.id)]))
      onClearFocus?.()
    }
  }, [focusOrder])

  const toggleSelect = (order: ActiveOrder) => {
    routeActiveRef.current = false
    setRouteStatus('idle')
    const id = String(order.id)
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Button: build route (only called manually)
  const showOnMap = () => {
    if (myPos) buildRoute(myPos, selectedIds, orders)
  }

  const selectedOrders = orders.filter(o => selectedIds.has(String(o.id)))

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900">
      {orders.length > 0 && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-full shadow-lg pointer-events-none">
          ● {orders.length} TA AKTIV MANZIL
        </div>
      )}

      {/* Map */}
      <div ref={mapRef} className="flex-1 relative bg-gray-100 dark:bg-gray-800" style={{ minHeight: 0 }}>
        {(!ymapsLoaded || !myPos) && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-gray-100 dark:bg-gray-800">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {!myPos ? 'Joylashuv aniqlanmoqda...' : 'Xarita yuklanmoqda...'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Order list — scrollable, capped height */}
      <div className="bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-3" style={{ maxHeight: '38%', overflowY: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Yo'nalishlar
            {selectedIds.size > 0 && (
              <span className="ml-2 text-blue-500 normal-case font-bold">{selectedIds.size} tanlandi</span>
            )}
          </p>
          {selectedIds.size > 0 && (
            <button onClick={() => { routeActiveRef.current = false; setRouteStatus('idle'); setSelectedIds(new Set()) }} className="text-xs text-gray-400 dark:text-gray-500 px-2 py-1">
              Bekor
            </button>
          )}
        </div>

        {orders.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Aktiv buyurtma yo'q</p>
        ) : (
          <div className="space-y-2">
            {orders.map(order => {
              const isSelected = selectedIds.has(String(order.id))
              return (
                <button
                  key={order.id}
                  onClick={() => toggleSelect(order)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-colors border-2 ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400'
                      : 'bg-gray-50 dark:bg-gray-800 border-transparent'
                  }`}
                >
                  <div className="shrink-0">
                    {isSelected
                      ? <CheckSquare size={20} className="text-blue-500" />
                      : <Square size={20} className="text-gray-300 dark:text-gray-600" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">
                      #{order.order_number} · {order.client_name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{order.address_text}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{formatMoney(order.total_amount)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{formatTime(order.created_at)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Action buttons — separate flex item, always visible */}
      <div className="bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 p-3 flex gap-2" style={{ flexShrink: 0 }}>
        {selectedOrders.length === 1 && selectedOrders[0].client_phone && (
          <a
            href={`tel:${selectedOrders[0].client_phone}`}
            className="w-12 h-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl flex items-center justify-center shadow-sm active:scale-90"
          >
            <Phone size={18} className="text-blue-600" />
          </a>
        )}
        <button
          onClick={selectedOrders.length > 0 ? showOnMap : undefined}
          className={`flex-1 h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
            selectedOrders.length > 0
              ? routeStatus === 'error' ? 'bg-red-500 text-white' : 'bg-blue-600 text-white active:scale-[0.98] active:bg-blue-700'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
          }`}
        >
          {routeStatus === 'loading'
            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Hisoblanmoqda...</>
            : routeStatus === 'error'
              ? <><MapPin size={16} /> Marshrut topilmadi</>
              : <><MapPin size={16} />{selectedOrders.length === 0 ? 'Buyurtma tanlang' : selectedOrders.length > 1 ? `${selectedOrders.length} ta nuqtaga marshrut` : "Marshrut ko'rish"}</>
          }
        </button>
      </div>
    </div>
  )
}
