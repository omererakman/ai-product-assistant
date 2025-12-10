import { useState, useEffect } from 'react';
import './Orders.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
}

interface Order {
  order_id: string;
  items: OrderItem[];
  total_price: number;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  shipping_address?: string;
  billing_address?: string;
  invoice_email?: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  created_at: string;
}

interface OrdersProps {
  onBack: () => void;
}

export function Orders({ onBack }: OrdersProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all-except-cancelled');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${API_URL}/api/orders`);
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      const data = await response.json();
      setOrders(data.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (orderId: string) => {
    if (!confirm(`Are you sure you want to cancel order ${orderId}?`)) {
      return;
    }

    try {
      setCancellingId(orderId);
      const response = await fetch(`${API_URL}/api/orders/${orderId}/cancel`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        throw new Error('Failed to cancel order');
      }

      const data = await response.json();
      
      // Update the order status in the list
      setOrders((prev) =>
        prev.map((order) =>
          order.order_id === orderId ? { ...order, status: 'cancelled' } : order
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel order');
      console.error('Error cancelling order:', err);
    } finally {
      setCancellingId(null);
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (statusFilter === 'all-except-cancelled') {
      return order.status !== 'cancelled';
    }
    if (statusFilter === 'all') {
      return true;
    }
    return order.status === statusFilter;
  });

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return '#f59e0b';
      case 'confirmed':
        return '#3b82f6';
      case 'processing':
        return '#8b5cf6';
      case 'shipped':
        return '#6366f1';
      case 'delivered':
        return '#22c55e';
      case 'cancelled':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  if (loading) {
    return (
      <div className="orders-container">
        <div className="orders-header">
          <button onClick={onBack} className="back-button">
            ← Back to Chat
          </button>
          <h1>Orders</h1>
        </div>
        <div className="orders-loading">
          <div className="loading-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p>Loading orders...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="orders-container">
        <div className="orders-header">
          <button onClick={onBack} className="back-button">
            ← Back to Chat
          </button>
          <h1>Orders</h1>
        </div>
        <div className="orders-error">
          <p>Error: {error}</p>
          <button onClick={fetchOrders} className="retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="orders-container">
      <div className="orders-header">
        <button onClick={onBack} className="back-button">
          ← Back to Chat
        </button>
        <h1>Orders</h1>
        <div className="orders-header-controls">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="status-filter"
            title="Filter by status"
          >
            <option value="all-except-cancelled">Active Orders</option>
            <option value="all">All Orders</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <button onClick={fetchOrders} className="refresh-button" title="Refresh orders">
            ↻ Refresh
          </button>
        </div>
      </div>

      {filteredOrders.length === 0 ? (
        <div className="orders-empty">
          <p>{orders.length === 0 ? 'No orders found.' : 'No orders match the selected filter.'}</p>
        </div>
      ) : (
        <div className="orders-list">
          {filteredOrders.map((order) => (
            <div key={order.order_id} className="order-card">
              <div className="order-header">
                <div className="order-id-section">
                  <h2>Order {order.order_id}</h2>
                  <span
                    className="order-status"
                    style={{ backgroundColor: `${getStatusColor(order.status)}20`, color: getStatusColor(order.status) }}
                  >
                    {order.status.toUpperCase()}
                  </span>
                </div>
                {order.status !== 'cancelled' && (
                  <button
                    onClick={() => handleCancel(order.order_id)}
                    disabled={cancellingId === order.order_id}
                    className="cancel-button"
                    title="Cancel order"
                  >
                    {cancellingId === order.order_id ? (
                      <>
                        <span className="cancel-spinner"></span>
                        <span>Cancelling...</span>
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M15 9l-6 6M9 9l6 6" />
                        </svg>
                        <span>Cancel</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="order-details">
                <div className="order-section">
                  <h3>Items</h3>
                  <ul className="order-items">
                    {order.items.map((item, idx) => (
                      <li key={idx}>
                        <span className="item-name">{item.product_name}</span>
                        <span className="item-quantity">x{item.quantity}</span>
                        <span className="item-price">${item.price.toFixed(2)}</span>
                        <span className="item-total">${(item.price * item.quantity).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="order-total">
                    <strong>Total: ${order.total_price.toFixed(2)}</strong>
                  </div>
                </div>

                {(order.customer_name || order.customer_email || order.customer_phone) && (
                  <div className="order-section">
                    <h3>Customer Information</h3>
                    <div className="order-info-grid">
                      {order.customer_name && (
                        <div>
                          <strong>Name:</strong> {order.customer_name}
                        </div>
                      )}
                      {order.customer_email && (
                        <div>
                          <strong>Email:</strong> {order.customer_email}
                        </div>
                      )}
                      {order.customer_phone && (
                        <div>
                          <strong>Phone:</strong> {order.customer_phone}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {(order.shipping_address || order.billing_address) && (
                  <div className="order-section">
                    <h3>Addresses</h3>
                    <div className="order-info-grid">
                      {order.shipping_address && (
                        <div>
                          <strong>Shipping:</strong> {order.shipping_address}
                        </div>
                      )}
                      {order.billing_address && (
                        <div>
                          <strong>Billing:</strong> {order.billing_address}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {order.invoice_email && (
                  <div className="order-section">
                    <h3>Invoice</h3>
                    <div className="order-info-grid">
                      <div>
                        <strong>Invoice Email:</strong> {order.invoice_email}
                      </div>
                    </div>
                  </div>
                )}

                <div className="order-section">
                  <div className="order-date">
                    <strong>Created:</strong> {formatDate(order.created_at)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
