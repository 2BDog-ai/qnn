import React, { useState, useEffect } from 'react';
import {
  CheckCircleIcon,
  XCircleIcon,
  InfoIcon,
  WarningIcon
} from './icons/AudioIcons';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationSystemProps {
  notifications: Notification[];
  onRemove: (id: string) => void;
}

export const NotificationSystem: React.FC<NotificationSystemProps> = ({
  notifications,
  onRemove
}) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 max-w-md">
      {notifications.map(notification => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
};

interface NotificationItemProps {
  notification: Notification;
  onRemove: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onRemove
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // 动画进入
    setTimeout(() => setIsVisible(true), 10);

    // 自动消失
    if (notification.duration !== 0) {
      const timer = setTimeout(() => {
        handleRemove();
      }, notification.duration || 5000);

      return () => clearTimeout(timer);
    }
  }, [notification.duration]);

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => {
      onRemove(notification.id);
    }, 300);
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <WarningIcon className="w-5 h-5 text-yellow-500" />;
      case 'info':
      default:
        return <InfoIcon className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStyles = () => {
    const baseStyles = 'bg-white border-l-4 shadow-xl rounded-lg overflow-hidden';
    const animationStyles = `transform transition-all duration-300 ${
      isExiting 
        ? 'translate-x-full opacity-0' 
        : isVisible 
          ? 'translate-x-0 opacity-100' 
          : 'translate-x-full opacity-0'
    }`;
    
    const borderStyles = {
      success: 'border-green-500',
      error: 'border-red-500',
      warning: 'border-yellow-500',
      info: 'border-blue-500'
    };

    return `${baseStyles} ${animationStyles} ${borderStyles[notification.type]}`;
  };

  return (
    <div className={getStyles()}>
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            {getIcon()}
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {notification.title}
            </p>
            {notification.message && (
              <p className="mt-1 text-sm text-gray-500">
                {notification.message}
              </p>
            )}
            {notification.action && (
              <button
                onClick={notification.action.onClick}
                className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
              >
                {notification.action.label}
              </button>
            )}
          </div>
          <button
            onClick={handleRemove}
            className="ml-4 text-gray-400 hover:text-gray-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      </div>
      
      {/* 进度条 */}
      {notification.duration !== 0 && (
        <div className="h-1 bg-gray-100">
          <div 
            className={`h-full transition-all ${
              notification.type === 'success' ? 'bg-green-500' :
              notification.type === 'error' ? 'bg-red-500' :
              notification.type === 'warning' ? 'bg-yellow-500' :
              'bg-blue-500'
            }`}
            style={{
              animation: `shrink ${notification.duration || 5000}ms linear`,
              transformOrigin: 'left'
            }}
          />
        </div>
      )}
      
      <style jsx>{`
        @keyframes shrink {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
      `}</style>
    </div>
  );
};

// Hook for using notifications
export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = (notification: Omit<Notification, 'id'>) => {
    const id = `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    setNotifications(prev => [...prev, { ...notification, id }]);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const notify = {
    success: (title: string, message?: string, duration?: number) => {
      addNotification({ type: 'success', title, message, duration });
    },
    error: (title: string, message?: string, duration?: number) => {
      addNotification({ type: 'error', title, message, duration });
    },
    info: (title: string, message?: string, duration?: number) => {
      addNotification({ type: 'info', title, message, duration });
    },
    warning: (title: string, message?: string, duration?: number) => {
      addNotification({ type: 'warning', title, message, duration });
    }
  };

  return {
    notifications,
    removeNotification,
    notify
  };
};