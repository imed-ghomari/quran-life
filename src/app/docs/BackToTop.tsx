'use client';

import { useEffect, useState } from 'react';
import { ChevronUp } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function BackToTop() {
    const [isVisible, setIsVisible] = useState(false);
    const pathname = usePathname();

    useEffect(() => {
        // Use a small timeout to ensure the DOM is ready
        const timer = setTimeout(() => {
            const mainElement = document.querySelector('.docs-main');
            if (!mainElement) return;

            const toggleVisibility = () => {
                if (mainElement.scrollTop > 300) {
                    setIsVisible(true);
                } else {
                    setIsVisible(false);
                }
            };

            mainElement.addEventListener('scroll', toggleVisibility);
            // Initial check
            toggleVisibility();

            return () => mainElement.removeEventListener('scroll', toggleVisibility);
        }, 100);

        return () => clearTimeout(timer);
    }, [pathname]);

    const scrollToTop = () => {
        const mainElement = document.querySelector('.docs-main');
        if (mainElement) {
            mainElement.scrollTo({
                top: 0,
                behavior: 'smooth',
            });
        }
    };

    if (!isVisible) return null;

    return (
        <button
            onClick={scrollToTop}
            className="back-to-top"
            aria-label="Back to top"
        >
            <ChevronUp size={20} />
        </button>
    );
}
