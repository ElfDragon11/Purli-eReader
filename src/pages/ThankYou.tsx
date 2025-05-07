import React from 'react';
import { Link } from 'react-router-dom'; // If using React Router

const ThankYou: React.FC = () => {
    return (
        <div className="bg-gray-100 h-screen flex flex-col items-center justify-center">
            <div className="container bg-white p-8 rounded-lg shadow-md text-center">
                <h1 className="text-3xl font-semibold text-green-600 mb-4">Thank You for Subscribing!</h1>
                <p className="text-gray-700 mb-6">Your subscription is now active. You can manage your subscription in your profile.</p>
                <Link to="/library" className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded">
                    Go to the Library
                </Link>
            </div>
        </div>
    );
};

export default ThankYou;