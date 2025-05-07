import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import EpubReport from './pages/EpubReport';
import UserProfile from './pages/UserProfile';
import Library from './pages/Library';
import Reader from './pages/Reader';
import Terms from './pages/Terms';
import Home from './pages/Home';
import Auth from './pages/Auth';
import CheckoutForm from './pages/Checkout';
import Return from './pages/Return';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import SubscriptionRequired from './components/SubscriptionRequired';





function App() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <Router>
          <div className="min-h-screen bg-gray-50">
            <Navbar />
            <main className=" mx-auto pt-8">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/library" element={                    
                  <SubscriptionRequired>
                      <Library />
                    </SubscriptionRequired>
                  } />
                <Route path="/reader/:bookId" element={                    
                  <SubscriptionRequired>
                      <Reader />
                    </SubscriptionRequired>} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/checkout" element={<CheckoutForm />} />
                <Route path="/return" element={<Return />} />
                <Route path="/profile" element={<UserProfile />} />EpubReport
                <Route path="/report" element={<EpubReport />} />
                <Route path="/*" element={<Home />} />
              </Routes>
            </main>
          </div>
        </Router>
      </SubscriptionProvider>
    </AuthProvider>
  );
}

export default App;

