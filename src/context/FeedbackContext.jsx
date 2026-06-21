import { createContext, useContext, useState, useCallback } from 'react';
import ActionFeedbackModal from '../components/ActionFeedbackModal';

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const [feedback, setFeedback] = useState(null);

  const showFeedback = useCallback((type, title, message) => {
    setFeedback({ type, title, message });
  }, []);

  const hideFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const success = useCallback((message, title = 'نجاح') => {
    showFeedback('success', title, message);
  }, [showFeedback]);

  const error = useCallback((message, title = 'خطأ') => {
    showFeedback('error', title, message);
  }, [showFeedback]);

  const warning = useCallback((message, title = 'تحذير') => {
    showFeedback('warning', title, message);
  }, [showFeedback]);

  const info = useCallback((message, title = 'معلومة') => {
    showFeedback('info', title, message);
  }, [showFeedback]);

  return (
    <FeedbackContext.Provider value={{ showFeedback, hideFeedback, success, error, warning, info }}>
      {children}
      {feedback && (
        <ActionFeedbackModal
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
          onClose={hideFeedback}
        />
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
}