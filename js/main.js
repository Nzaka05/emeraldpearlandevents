/**
 * EMERALD PEARLAND EVENTS - MAIN JAVASCRIPT
 * Creating Moments, Delivering Excellence
 */

// Global variables
let currentGalleryIndex = 0;
let galleryImages = [];
let typingTimeout;

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

// Initialize all app functionality
function initializeApp() {
    initNavigation();
    initTypingAnimation();
    initScrollEffects();
    initServiceAccordions();
    initQuoteModal();
    initGallery();
    initLightbox();
    initSmoothScrolling();
    initContactForms();
    initIntersectionObserver();
    
    console.log('Emerald Pearland Events - Website Initialized Successfully!');
}

// ================================
// NAVIGATION FUNCTIONALITY
// ================================

function initNavigation() {
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    const navLinks = document.querySelectorAll('.nav-link');

    // Mobile navigation toggle
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            navToggle.classList.toggle('active');
        });
    }

    // Close mobile menu when clicking on links
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navMenu.classList.remove('active');
            navToggle.classList.remove('active');
        });
    });

    // Navbar scroll effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Active navigation highlighting
    window.addEventListener('scroll', updateActiveNavigation);
}

function updateActiveNavigation() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-link');
    
    let current = '';
    sections.forEach(section => {
        const sectionTop = section.getBoundingClientRect().top;
        const sectionHeight = section.offsetHeight;
        
        if (sectionTop <= 150 && sectionTop + sectionHeight > 150) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
}

// ================================
// TYPING ANIMATION
// ================================

function initTypingAnimation() {
    const typingElement = document.getElementById('typing-text');
    if (!typingElement) return;

    const phrases = [
        'Creating Moments, Delivering Excellence',
        'Professional Event Management',
        'Exceptional Service Standards',
        'Your Perfect Event Partner'
    ];

    let currentPhrase = 0;
    let currentChar = 0;
    let isDeleting = false;

    function typeEffect() {
        const currentText = phrases[currentPhrase];
        
        if (isDeleting) {
            typingElement.textContent = currentText.substring(0, currentChar - 1);
            currentChar--;
        } else {
            typingElement.textContent = currentText.substring(0, currentChar + 1);
            currentChar++;
        }

        let typeSpeed = isDeleting ? 50 : 100;

        if (!isDeleting && currentChar === currentText.length) {
            typeSpeed = 2000; // Pause at end
            isDeleting = true;
        } else if (isDeleting && currentChar === 0) {
            isDeleting = false;
            currentPhrase = (currentPhrase + 1) % phrases.length;
            typeSpeed = 500; // Pause before next phrase
        }

        typingTimeout = setTimeout(typeEffect, typeSpeed);
    }

    // Start typing animation after initial delay
    setTimeout(typeEffect, 1000);
}

// ================================
// SCROLL EFFECTS
// ================================

function initScrollEffects() {
    // Smooth scroll for internal links
    const scrollLinks = document.querySelectorAll('a[href^="#"]');
    scrollLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            const targetSection = document.getElementById(targetId);
            
            if (targetSection) {
                const offsetTop = targetSection.getBoundingClientRect().top + window.pageYOffset - 80;
                window.scrollTo({
                    top: offsetTop,
                    behavior: 'smooth'
                });
            }
        });
    });

    // Scroll indicator
    const scrollIndicator = document.querySelector('.scroll-indicator');
    if (scrollIndicator) {
        scrollIndicator.addEventListener('click', () => {
            const aboutSection = document.getElementById('about');
            if (aboutSection) {
                aboutSection.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    }
}

function initSmoothScrolling() {
    // Add smooth scrolling behavior to all anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ================================
// SERVICE ACCORDIONS
// ================================

function initServiceAccordions() {
    const categoryHeaders = document.querySelectorAll('.category-header');

    categoryHeaders.forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            const isActive = header.classList.contains('active');

            // Close all other accordions
            categoryHeaders.forEach(otherHeader => {
                if (otherHeader !== header) {
                    otherHeader.classList.remove('active');
                    otherHeader.nextElementSibling.classList.remove('active');
                }
            });

            // Toggle current accordion
            if (isActive) {
                header.classList.remove('active');
                content.classList.remove('active');
            } else {
                header.classList.add('active');
                content.classList.add('active');
            }
        });
    });

    // Open first accordion by default
    if (categoryHeaders.length > 0) {
        categoryHeaders[0].classList.add('active');
        categoryHeaders[0].nextElementSibling.classList.add('active');
    }
}

// ================================
// QUOTE MODAL FUNCTIONALITY
// ================================

function initQuoteModal() {
    const modal = document.getElementById('quote-modal');
    const quoteForm = document.getElementById('quote-form');
    const closeModal = document.getElementById('close-quote-modal');
    const cancelBtn = document.getElementById('cancel-quote');
    const bookEventBtn = document.getElementById('book-event-btn');
    const askQuestionBtn = document.getElementById('ask-question-btn');
    const serviceButtons = document.querySelectorAll('[data-service]');

    // Open modal for service quotes
    serviceButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const serviceName = btn.getAttribute('data-service');
            openQuoteModal(serviceName);
        });
    });

    // Open modal for general booking
    if (bookEventBtn) {
        bookEventBtn.addEventListener('click', () => {
            openQuoteModal('General Event Booking');
        });
    }

    // General inquiry via WhatsApp
    if (askQuestionBtn) {
        askQuestionBtn.addEventListener('click', () => {
            openGeneralInquiry();
        });
    }

    // Close modal events
    if (closeModal) {
        closeModal.addEventListener('click', closeQuoteModal);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeQuoteModal);
    }

    // Close modal when clicking outside
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeQuoteModal();
            }
        });
    }

    // Handle form submission
    if (quoteForm) {
        quoteForm.addEventListener('submit', handleQuoteSubmission);
    }

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeQuoteModal();
        }
    });
}

function openQuoteModal(serviceName) {
    const modal = document.getElementById('quote-modal');
    const serviceInput = document.getElementById('service-type');
    
    if (modal && serviceInput) {
        serviceInput.value = serviceName;
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Focus on first input
        setTimeout(() => {
            document.getElementById('client-name').focus();
        }, 300);
    }
}

function closeQuoteModal() {
    const modal = document.getElementById('quote-modal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        
        // Reset form
        const form = document.getElementById('quote-form');
        if (form) {
            form.reset();
        }
    }
}

function handleQuoteSubmission(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    // Validate required fields
    if (!data.clientName || !data.serviceType || !data.eventDate || !data.eventLocation) {
        alert('Please fill in all required fields.');
        return;
    }

    // Show loading
    showLoading(true);

    // Prepare WhatsApp message
    const message = `Hello Emerald Pearland Events,

My name is ${data.clientName}.
I would like to request a quote for: ${data.serviceType}.
Event Date: ${data.eventDate}.
Location: ${data.eventLocation}.
${data.budget ? `Budget: ${data.budget}.` : ''}
${data.notes ? `Notes: ${data.notes}` : ''}

Looking forward to hearing from you!`;

    // Open WhatsApp
    const encodedMessage = encodeURIComponent(message);
    const whatsappURL = `https://wa.me/254722446937?text=${encodedMessage}`;
    
    setTimeout(() => {
        showLoading(false);
        window.open(whatsappURL, '_blank');
        closeQuoteModal();
    }, 1000);
}

function openGeneralInquiry() {
    const message = `Hello Emerald Pearland Events,

I would like to make an inquiry.
My name is [Your Name].
Inquiry: [Your Question/Request]

Thank you!`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappURL = `https://wa.me/254722446937?text=${encodedMessage}`;
    window.open(whatsappURL, '_blank');
}

// ================================
// GALLERY FUNCTIONALITY
// ================================

function initGallery() {
    const galleryItems = document.querySelectorAll('.gallery-item');
    const viewGalleryBtn = document.getElementById('view-gallery-btn');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const PREVIEW_COUNT = 6; // show 6 images first
    
    // Collect gallery images
    galleryImages = Array.from(galleryItems).map(item => {
        return {
            src: item.getAttribute('data-image'),
            alt: item.querySelector('img').alt,
            title: item.querySelector('.gallery-overlay h3').textContent
        };
    });

    // Collapse gallery to preview count
    const gridWrapper = document.querySelector('.gallery-grid-wrapper');
    if (galleryItems.length > PREVIEW_COUNT) {
        gridWrapper.classList.add('collapsed');
        galleryItems.forEach((item, idx) => {
            if (idx >= PREVIEW_COUNT) item.classList.add('hidden');
        });
    } else {
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';
    }

    // Gallery item click handlers
    galleryItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            openLightbox(index);
        });
    });

    // View full gallery button
    if (viewGalleryBtn) {
        viewGalleryBtn.addEventListener('click', () => {
            openLightbox(0);
        });
    }

    // Load More behavior
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            const hiddenItems = document.querySelectorAll('.gallery-item.hidden');
            const isCollapsed = gridWrapper.classList.contains('collapsed');

            if (isCollapsed) {
                // Expand
                gridWrapper.classList.remove('collapsed');
                hiddenItems.forEach((it, i) => {
                    setTimeout(() => it.classList.remove('hidden'), i * 80);
                });
                loadMoreBtn.textContent = 'Show Less';
            } else {
                // Collapse again
                hiddenItems.forEach(it => it.classList.add('hidden'));
                setTimeout(() => gridWrapper.classList.add('collapsed'), 60);
                loadMoreBtn.textContent = 'Load More';
                // Scroll into view for better UX
                const gallerySection = document.getElementById('gallery');
                if (gallerySection) gallerySection.scrollIntoView({ behavior: 'smooth' });
            }
        });
    }
}

// ================================
// LIGHTBOX FUNCTIONALITY
// ================================

function initLightbox() {
    const lightbox = document.getElementById('gallery-lightbox');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxPrev = document.querySelector('.lightbox-prev');
    const lightboxNext = document.querySelector('.lightbox-next');

    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }

    if (lightboxPrev) {
        lightboxPrev.addEventListener('click', () => {
            navigateGallery(-1);
        });
    }

    if (lightboxNext) {
        lightboxNext.addEventListener('click', () => {
            navigateGallery(1);
        });
    }

    // Close lightbox when clicking outside
    if (lightbox) {
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;

        switch(e.key) {
            case 'Escape':
                closeLightbox();
                break;
            case 'ArrowLeft':
                navigateGallery(-1);
                break;
            case 'ArrowRight':
                navigateGallery(1);
                break;
        }
    });
}

function openLightbox(index) {
    const lightbox = document.getElementById('gallery-lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    
    if (lightbox && lightboxImage && galleryImages[index]) {
        currentGalleryIndex = index;
        lightboxImage.src = galleryImages[index].src;
        lightboxImage.alt = galleryImages[index].alt;
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeLightbox() {
    const lightbox = document.getElementById('gallery-lightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function navigateGallery(direction) {
    const newIndex = currentGalleryIndex + direction;
    
    if (newIndex >= 0 && newIndex < galleryImages.length) {
        openLightbox(newIndex);
    } else if (newIndex < 0) {
        openLightbox(galleryImages.length - 1); // Loop to last image
    } else {
        openLightbox(0); // Loop to first image
    }
}

// ================================
// CONTACT FORM FUNCTIONALITY
// ================================

function initContactForms() {
    // WhatsApp contact links
    const whatsappLinks = document.querySelectorAll('a[href*="wa.me"]');
    whatsappLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Analytics tracking could be added here
            console.log('WhatsApp contact initiated');
        });
    });

    // Email links
    const emailLinks = document.querySelectorAll('a[href^="mailto:"]');
    emailLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            console.log('Email contact initiated');
        });
    });
}

// ================================
// INTERSECTION OBSERVER (ANIMATIONS)
// ================================

function initIntersectionObserver() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                
                // Add staggered animations for grid items
                if (entry.target.classList.contains('highlights-grid') ||
                    entry.target.classList.contains('services-grid') ||
                    entry.target.classList.contains('gallery-grid')) {
                    
                    const items = entry.target.children;
                    Array.from(items).forEach((item, index) => {
                        setTimeout(() => {
                            item.classList.add('animate-in');
                        }, index * 100);
                    });
                }
            }
        });
    }, observerOptions);

    // Observe elements for animation
    const animatedElements = document.querySelectorAll(
        '.highlight-card, .service-category, .gallery-item, .contact-item, .about-text'
    );
    
    animatedElements.forEach(el => {
        observer.observe(el);
    });
}

// ================================
// UTILITY FUNCTIONS
// ================================

function showLoading(show) {
    const spinner = document.getElementById('loading-spinner');
    if (spinner) {
        if (show) {
            spinner.classList.remove('hidden');
        } else {
            spinner.classList.add('hidden');
        }
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return function() {
        const context = this;
        const args = arguments;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(function() {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}

// Optimized scroll handler
const handleScroll = throttle(() => {
    updateActiveNavigation();
}, 100);

window.addEventListener('scroll', handleScroll);

// ================================
// ERROR HANDLING
// ================================

window.addEventListener('error', (e) => {
    console.error('JavaScript Error:', e.error);
    // Could send error reports to analytics service
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled Promise Rejection:', e.reason);
});

// ================================
// PERFORMANCE OPTIMIZATION
// ================================

// Preload critical images
function preloadImages() {
    const criticalImages = [
        'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=1920'
    ];

    criticalImages.forEach(src => {
        const img = new Image();
        img.src = src;
    });
}

// Initialize performance optimizations
document.addEventListener('DOMContentLoaded', () => {
    // Preload critical images
    preloadImages();
    
    // Add loading states
    document.body.classList.add('loaded');
});

// ================================
// ACCESSIBILITY ENHANCEMENTS
// ================================

// Focus management for modals
function trapFocus(element) {
    const focusableElements = element.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    element.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            if (e.shiftKey) {
                if (document.activeElement === firstFocusable) {
                    lastFocusable.focus();
                    e.preventDefault();
                }
            } else {
                if (document.activeElement === lastFocusable) {
                    firstFocusable.focus();
                    e.preventDefault();
                }
            }
        }
    });
}

// Apply focus trap to modals when opened
document.addEventListener('DOMContentLoaded', () => {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (modal.classList.contains('active')) {
                        trapFocus(modal);
                    }
                }
            });
        });
        
        observer.observe(modal, { attributes: true });
    });
});

// Announce page changes for screen readers
function announcePageChange(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
        document.body.removeChild(announcement);
    }, 1000);
}

console.log('🎉 Emerald Pearland Events - All systems ready!');
console.log('Creating Moments, Delivering Excellence ✨');

// Export functions for potential use in other scripts
window.EmeraldEvents = {
    openQuoteModal,
    closeQuoteModal,
    openLightbox,
    closeLightbox,
    showLoading
};