/*import React, { useEffect } from 'react';
useEffect(() => {
    console.log(import.meta.env)
  }, []);*/
import { Link } from 'react-router-dom';
import { Card, CardContent } from "../components/ui/card";
import {
    BookCopy,
    ArrowRight,
    Pencil,
    Heart,
    Book,
    ScrollText,
    School,
    FileEdit,
} from "lucide-react";

import { motion } from "framer-motion";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious
} from "../components/ui/carousel";

import { AspectRatio } from "../components/ui/aspect-ratio";
import books from "../data/books.json";
import { useAuth } from '../contexts/AuthContext';
// Sample book data
const featuredBooks = books;


const Home = () => {
    const { user } = useAuth();
    return (
        <div className="min-h-screen bg-off-white">
            <div className="container mx-auto px-4 py-16 md:py-24">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="text-center mb-12"
                >
                    <h1 className="text-5xl md:text-6xl font-bold mb-2 text-deep-navy">
                        Read More. Worry Less.
                    </h1>
                    <h2 className="text-2xl md:text-2xl italic mb-6 text-deep-navy">
                        Read clean versions of your favorite books
                    </h2>
                    <p className="text-xl text-deep-navy/80 max-w-2xl mx-auto">
                        Now you can read without worry and share books with
                        confidence. Purli offers a clean reading experience with your favorite
                        books, removing profanity and explicit scenes while
                        keeping the story intact.
                    </p>
                </motion.div>

                <div className="text-center">
                    <Link
                        id="submitButton"
                        to={user ? `/library` : `/auth?signup=true`}
                        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 py-2 w-60 bg-faded-blue hover:bg-soft-clay text-deep-navy font-medium"
                    >
                        Start Reading
                    </Link>
                </div>

                {/* Stats */}
                <div className="mt-8 text-center text-deep-navy/70">
                    <div className="flex items-center justify-center gap-2">
                        <span></span>
                    </div>
                </div>
            </div>

            {/* Featured Books Carousel */}
            <div className="my-12">
                <h2 className="text-3xl font-bold text-center mb-8 text-deep-navy">
                    Popular Books
                </h2>
                <Carousel className="w-full max-w-5xl mx-auto">
                    <CarouselContent>
                        {featuredBooks.map((book) => (
                            <CarouselItem
                                key={book.id}
                                className="md:basis-1/3 lg:basis-1/4"
                            >
                                <Link to={user ? `/library` : `/auth`}>
                                    <div className="p-1">
                                        <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300">
                                            <CardContent className="p-0">
                                                <AspectRatio
                                                    ratio={2 / 3}
                                                    className="bg-muted"
                                                >
                                                    <img
                                                        src={book.cover}
                                                        alt={book.title}
                                                        className="object-cover w-full h-full"
                                                    />
                                                </AspectRatio>
                                                <div className="p-4">
                                                    <h3 className="font-semibold text-deep-navy truncate">
                                                        {book.title}
                                                    </h3>
                                                    <p className="text-sm text-deep-navy/70">
                                                        {book.author}
                                                    </p>
                                                    <div className="mt-2">
                                                        <span className="inline-block px-2 py-1 text-xs bg-faded-blue/20 text-deep-navy rounded-full">
                                                            {book.genre}
                                                        </span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </Link>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    <CarouselPrevious className="left-0" />
                    <CarouselNext className="right-0" />
                </Carousel>
                <div className="text-center mt-6">
                </div>
            </div>

            {/* How it Works */}
            <div className="bg-warm-beige/10 py-16">
                <div className="container mx-auto px-4">
                    <h2 className="text-3xl font-bold text-center mb-12 text-deep-navy">
                        How It Works
                    </h2>
                    <div className="grid md:grid-cols-3 gap-8 relative">
                        {howItWorks.map((step, i) => (
                            <motion.div
                                key={step.title}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: i * 0.1 }}
                                className="relative"
                            >
                                <div className="p-6 rounded-lg bg-white border border-soft-gray h-full">
                                    <div className="flex items-center justify-center mb-6">
                                        <div className="p-3 rounded-full bg-faded-blue/10">
                                            <step.icon className="h-8 w-8 text-faded-blue" />
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-semibold mb-2 text-deep-navy text-center">
                                        {step.title}
                                    </h3>
                                    <p className="text-deep-navy/70 text-center">
                                        {step.description}
                                    </p>
                                </div>
                                {i < howItWorks.length - 1 && (
                                    <div className="hidden md:flex absolute inset-y-0 right-[-2rem] z-10 items-center justify-center w-8">
                                        <ArrowRight className="h-6 w-6 text-soft-clay" />
                                    </div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Value Proposition */}
            <div className="py-16">
                <div className="container mx-auto px-4">
                    <h2 className="text-3xl font-bold text-center mb-12 text-deep-navy">
                        Why Choose Purli?
                    </h2>
                    <p className="text-center text-deep-navy/80 max-w-2xl mx-auto mb-12">
                        Purli ensures that every book keeps its essence while
                        making it accessible to those who prefer clean reading.
                    </p>
                    <div className="grid md:grid-cols-3 gap-8">
                        {valueProps.map((prop, i) => (
                            <motion.div
                                key={prop.title}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: i * 0.1 }}
                                className="p-6 rounded-lg bg-white border border-soft-gray"
                            >
                                <div className="flex flex-col items-center gap-4 mb-4">
                                    <div className="p-3 rounded-full bg-faded-blue/10">
                                        <prop.icon className="h-6 w-6 text-faded-blue" />
                                    </div>
                                    <h3 className="text-lg font-semibold text-deep-navy text-center">
                                        {prop.title}
                                    </h3>
                                </div>
                                <p className="text-deep-navy/70 text-center">
                                    {prop.description}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* FAQ Section */}
            <div className="bg-warm-beige/10 py-16">
                <div className="container mx-auto px-4">
                    <h2 className="text-3xl font-bold text-center mb-12 text-deep-navy">
                        Frequently Asked Questions
                    </h2>
                    <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                        {faqs.map((faq, i) => (
                            <motion.div
                                key={faq.question}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: i * 0.1 }}
                                className="p-6 rounded-lg bg-white border border-soft-gray"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="mt-1">
                                        <ScrollText className="h-5 w-5 text-faded-blue" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold mb-2 text-deep-navy">
                                            {faq.question}
                                        </h3>
                                        <p className="text-deep-navy/70">
                                            {faq.answer}
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <footer className="py-8 bg-deep-navy text-white">
                <div className="container mx-auto px-4">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-white/70">
                            © 2025 Purli. All rights reserved.
                        </p>
                        <div className="flex items-center gap-4">
                            <Link to='/terms' className="text-white hover:text-faded-blue">
                                Privacy Policy
                            </Link>
                            <Link to='/terms' className="text-white hover:text-faded-blue">
                                Terms of Use
                            </Link>
                            <a href="mailto:contact@purlibooks.com" className="text-white hover:text-faded-blue">
                                Contact Us
                            </a>
                        </div>
                    </div>
                </div>
            </footer>
    </div>
  );
};


const howItWorks = [
    {
        icon: BookCopy,
        title: "Upload Your eBook",
        description:
            "Upload your EPUB. The original file stays intact and private."
    },
    {
        icon: FileEdit,
        title: " Instant Filtering",
        description:
            "Purli hides flagged words and scenes on the fly while you read. Nothing is edited in the file itself."
    },
    {
        icon: Book,
        title: "Enjoy the Story",
        description: "Read a cleaner version, add bookmarks, and stay focused from start to finish."
    }
];

const valueProps = [
    {
        icon: Heart,
        title: "For Readers",
        description: "Enjoy your favorite books without uncomfortable content."
    },
    {
        icon: Pencil,
        title: "For Authors",
        description: "Reach a wider audience and generate additional revenue."
    },
    {
        icon: School,
        title: "For Parents & Schools",
        description: "Provide books that are safe for all audiences."
    }
];

const faqs = [
    {
        question: "Who is Purli for?",
        answer: "Anyone who wants to enjoy great stories without explicit content, including parents, schools, and readers who prefer clean versions."
    },
    {
        question: "How does the filter work?",
        answer: "You upload your EPUB book and read it inside the Purli app. Our filter hides flagged words and sections in real time. The original file never changes and never leaves your control."
      },
      {
        question: "Do authors still make money?",
        answer: "Yes. You purchase the book through a normal retailer before you upload it, so the author and publisher have already been paid. Purli only filters what you legally own."
      },
    {
        question: "Is this censorship?",
        answer: "Not at all! Purli is about choice, giving readers the option to enjoy books in a way that suits them best."
    }
];


export default Home;