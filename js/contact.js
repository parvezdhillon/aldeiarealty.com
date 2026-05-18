document.getElementById('contactForm').addEventListener('submit', async function(e) {
          e.preventDefault();
          const btn = this.querySelector('button[type="submit"]');
          const status = document.getElementById('formStatus');
          const originalText = btn.textContent;
          btn.textContent = 'Sending...';
          btn.disabled = true;
          try {
            const res = await fetch(this.action, { method: 'POST', body: new FormData(this), headers: { 'Accept': 'application/json' } });
            if (res.ok) {
              status.textContent = 'Thank you! We will contact you shortly.';
              status.style.color = '#296662';
              status.style.display = 'block';
              this.reset();
            } else {
              status.textContent = 'Something went wrong. Please email us at info@aldeiarealty.com';
              status.style.color = '#c64f2f';
              status.style.display = 'block';
            }
          } catch(err) {
            status.textContent = 'Unable to send. Please email us at info@aldeiarealty.com';
            status.style.color = '#c64f2f';
            status.style.display = 'block';
          }
          btn.textContent = originalText;
          btn.disabled = false;
        });