import React from 'react'
import {
  RouterProvider,
  createBrowserRouter,
  type RouteObject,
} from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { HomePage } from '@/pages/HomePage'
import { MarketPage } from '@/pages/MarketPage'
import { CategoryPage } from '@/pages/CategoryPage'
import { ProductDetailsPage } from '@/pages/ProductDetailsPage'
import { CartPage } from '@/pages/CartPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { RealCheckoutPage } from '@/pages/RealCheckoutPage'
import { OrderSuccessPage } from '@/pages/OrderSuccessPage'
import { TrackOrderPage } from '@/pages/TrackOrderPage'
import { CustomerOrdersPage } from '@/pages/CustomerOrdersPage'
import { CustomerOrderDetailPage } from '@/pages/CustomerOrderDetailPage'
import { WishlistPage } from '@/pages/WishlistPage'
import { LoginPage } from '@/pages/LoginPage'
import { AboutPage } from '@/pages/AboutPage'
import { ContactPage } from '@/pages/ContactPage'
import { SellerPage } from '@/pages/SellerPage'
import { SellerRegisterPage } from '@/pages/SellerRegisterPage'
import { SellerApplicationPage } from '@/pages/SellerApplicationPage'
import { SellerLayout } from '@/pages/seller/SellerLayout'
import { SellerOverviewPage } from '@/pages/seller/SellerOverviewPage'
import { SellerProductsPage } from '@/pages/seller/SellerProductsPage'
import { SellerProductNewPage } from '@/pages/seller/SellerProductNewPage'
import { SellerOrdersPage } from '@/pages/seller/SellerOrdersPage'
import { SellerOrderDetailPage } from '@/pages/seller/SellerOrderDetailPage'
import { SellerCustomersPage } from '@/pages/seller/SellerCustomersPage'
import { SellerEarningsPage } from '@/pages/seller/SellerEarningsPage'
import { SellerWithdrawalsPage } from '@/pages/seller/SellerWithdrawalsPage'
import { SellerShopPage } from '@/pages/seller/SellerShopPage'
import { SellerReviewsPage } from '@/pages/seller/SellerReviewsPage'
import { SellerSettingsPage } from '@/pages/seller/SellerSettingsPage'
import { AdminSellersPage } from '@/pages/AdminSellersPage'
import { AdminProductsPage } from '@/pages/AdminProductsPage'
import { AdminCategoriesPage } from '@/pages/AdminCategoriesPage'
import { AdminAccessPage } from '@/pages/AdminAccessPage'
import { AdminCommissionPage } from '@/pages/AdminCommissionPage'
import { PublicShopPage } from '@/pages/PublicShopPage'
import { AdminLayout } from '@/pages/AdminPage'
import { PlaceholderPage } from '@/pages/PlaceholderPage'
import { CartProvider } from '@/context/CartContext'
import { WishlistProvider } from '@/context/WishlistContext'
import { CouponProvider } from '@/context/CouponContext'
import { AuthProvider } from '@/context/AuthContext'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'
import { SellerRoute } from '@/components/auth/SellerRoute'

const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        // Live database marketplace (separate from the demo shop).
        path: 'market',
        element: <MarketPage />,
      },
      {
        path: 'shop',
        element: <PlaceholderPage title="Shop / All Products" />,
      },
      {
        path: 'shop/:shopSlug',
        element: <PublicShopPage />,
      },
      {
        path: 'category/:slug',
        element: <CategoryPage />,
      },
      {
        path: 'product/:slug',
        element: <ProductDetailsPage />,
      },
      {
        path: 'cart',
        element: <CartPage />,
      },
      {
        path: 'checkout',
        element: <CheckoutPage />,
      },
      {
        // Real authenticated marketplace checkout (migration 012).
        // Demo guest checkout above stays untouched.
        path: 'checkout/real',
        element: (
          <ProtectedRoute>
            <RealCheckoutPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'order-success',
        element: <OrderSuccessPage />,
      },
      {
        path: 'track-order',
        element: <TrackOrderPage />,
      },
      {
        // Real authenticated customer order history (migration 014).
        // Demo guest tracking above stays untouched.
        path: 'orders',
        element: (
          <ProtectedRoute>
            <CustomerOrdersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'orders/:orderId',
        element: (
          <ProtectedRoute>
            <CustomerOrderDetailPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'about',
        element: <AboutPage />,
      },
      {
        path: 'contact',
        element: <ContactPage />,
      },
      {
        path: 'sell',
        element: <SellerPage />,
      },
      {
        path: 'seller/register',
        element: <SellerRegisterPage />,
      },
      {
        path: 'seller/application',
        element: <SellerApplicationPage />,
      },
      {
        path: 'seller',
        element: (
          <SellerRoute>
            <SellerLayout />
          </SellerRoute>
        ),
        children: [
          { index: true, element: <SellerOverviewPage /> },
          { path: 'products/new', element: <SellerProductNewPage /> },
          { path: 'products', element: <SellerProductsPage /> },
          { path: 'orders', element: <SellerOrdersPage /> },
          { path: 'orders/:orderId', element: <SellerOrderDetailPage /> },
          { path: 'customers', element: <SellerCustomersPage /> },
          { path: 'earnings', element: <SellerEarningsPage /> },
          { path: 'withdrawals', element: <SellerWithdrawalsPage /> },
          { path: 'shop', element: <SellerShopPage /> },
          { path: 'reviews', element: <SellerReviewsPage /> },
          { path: 'settings', element: <SellerSettingsPage /> },
        ],
      },
      {
        path: 'login',
        element: <LoginPage />,
      },
      {
        path: 'wishlist',
        element: <WishlistPage />,
      },
      {
        path: 'admin/sellers',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminSellersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/products',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminProductsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/categories',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminCategoriesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/access',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminAccessPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/commission',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminCommissionPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'admin/*',
        element: (
          <ProtectedRoute requireAdmin>
            <AdminLayout />
          </ProtectedRoute>
        ),
      },
      {
        path: '*',
        element: <PlaceholderPage title="404 — Page Not Found" subtitle="The page you requested does not exist." />,
      },
    ],
  },
]

const router = createBrowserRouter(routes)

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CartProvider>
        <WishlistProvider>
          <CouponProvider>
            <RouterProvider router={router} />
          </CouponProvider>
        </WishlistProvider>
      </CartProvider>
    </AuthProvider>
  )
}

export default App