/**
 * NexusWeave — Interactive FAQ Accordion Script
 */

(function () {
  window.addEventListener('DOMContentLoaded', () => {
    const faqItems = document.querySelectorAll('.faq-item');

    faqItems.forEach((item) => {
      const header = item.querySelector('.faq-header');
      if (header) {
        header.addEventListener('click', () => {
          const isOpen = item.classList.contains('open');

          // Close all items
          faqItems.forEach((other) => other.classList.remove('open'));

          // Toggle clicked item
          if (!isOpen) {
            item.classList.add('open');
          }
        });
      }
    });
  });
})();
