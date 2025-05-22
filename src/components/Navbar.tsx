import { Link, useNavigate } from 'react-router-dom';
import { User, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo_long.png';
import { useState } from 'react';

const Navbar = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <>
      <style>
        {`
          @media (max-width: 768px) {
            .mobile-menu {
              display: flex;
              flex-direction: column;
              gap: 1rem;
              background-color: white;
              padding: 1rem;
              position: absolute;
              top: 4rem;
              right: 0;
              left: auto;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
              z-index: 10;
            }

            .mobile-menu.hidden {
              display: none;
            }
          }
        `}
      </style>

      <nav className="bg-white shadow-lg">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="flex items-center space-x-2">
              <img src={logo} alt="Purli quill logo" className="h-12 w-auto" />
            </Link>

            <button
              className="md:hidden text-gray-700 hover:text-blue-600"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            <div className={`mobile-menu ${isMobileMenuOpen ? '' : 'hidden'} md:block md:flex md:items-center md:space-x-4 md:ml-auto`}>
              <Link to="/report" className="text-gray-700 hover:text-blue-600" onClick={() => setIsMobileMenuOpen(false)}>
                Report
              </Link>
              <Link to="/Info" className="text-gray-700 hover:text-blue-600" onClick={() => setIsMobileMenuOpen(false)}>
                Info
              </Link>
              {user && (
                <>
                  <Link to="/profile" className="text-gray-700 hover:text-blue-600" onClick={() => setIsMobileMenuOpen(false)}>
                    Profile
                  </Link>
                  <Link to="/library" className="text-gray-700 hover:text-blue-600" onClick={() => setIsMobileMenuOpen(false)}>
                    Library
                  </Link>
                </>
              )}
              {user ? (
                <button
                  onClick={() => (
                    handleSignOut(),
                    setIsMobileMenuOpen(false)
                  )}
                  className="text-gray-700 hover:text-blue-600"
                >
                  
                  Sign Out
                  <LogOut className="h-4 w-4 inline-block ml-1 mb-1" />
                </button>
              ) : (
                <Link to="/auth" className="text-gray-700 hover:text-blue-600" onClick={() => setIsMobileMenuOpen(false)}>
                  
                  Sign In
                  <User className="h-4 w-4 inline-block ml-1 mb-1" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navbar;