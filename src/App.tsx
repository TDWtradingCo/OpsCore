import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { LoginPage } from '@/pages/LoginPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ProductsPage } from '@/pages/ProductsPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { InventoryPage } from '@/pages/InventoryPage'
import { InventoryDetailPage } from '@/pages/InventoryDetailPage'
import { PurchasesPage } from '@/pages/PurchasesPage'
import { PurchaseDetailPage } from '@/pages/PurchaseDetailPage'
import { PricingPage } from '@/pages/PricingPage'
import { ProfitabilityPage } from '@/pages/ProfitabilityPage'
import { SuppliersPage } from '@/pages/SuppliersPage'
import { SalesChannelsPage } from '@/pages/SalesChannelsPage'
import { SettingsPage } from '@/pages/SettingsPage'
import { ActivityLogPage } from '@/pages/ActivityLogPage'
import { ShipmentTrackingPage } from '@/pages/ShipmentTrackingPage'
import { OrdersPage } from '@/pages/OrdersPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4 bg-background">
        <div className="relative">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary/20 border-t-primary" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-3 w-3 rounded-full bg-primary/30 animate-pulse" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground font-medium">Loading your workspace…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <DashboardLayout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/products/:id" element={<ProductDetailPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/inventory/:inventoryId" element={<InventoryDetailPage />} />
                <Route path="/purchases" element={<PurchasesPage />} />
                <Route path="/purchases/:id" element={<PurchaseDetailPage />} />
                <Route path="/pricing" element={<PricingPage />} />
                <Route path="/profitability" element={<ProfitabilityPage />} />
                <Route path="/suppliers" element={<SuppliersPage />} />
                <Route path="/sales-channels" element={<SalesChannelsPage />} />
                <Route path="/activity" element={<ActivityLogPage />} />
                <Route path="/tracking" element={<ShipmentTrackingPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={
                  <div className="flex flex-col items-center justify-center py-20">
                    <h1 className="text-4xl font-bold">404</h1>
                    <p className="text-muted-foreground mt-2">Page not found</p>
                    <a href="/" className="mt-4 text-primary hover:underline">Go to Dashboard</a>
                  </div>
                } />
              </Routes>
            </DashboardLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
