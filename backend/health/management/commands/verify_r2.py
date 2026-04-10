"""
Verify Cloudflare R2 connectivity and round-trip a test file.

Usage: python manage.py verify_r2

Checks:
  1. Required R2_* env vars are set
  2. Default storage is S3Boto3Storage (not filesystem)
  3. Can write a small test object
  4. Can read it back
  5. Can delete it
"""
from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.conf import settings


class Command(BaseCommand):
    help = 'Verify Cloudflare R2 storage configuration'

    def handle(self, *args, **opts):
        backend = default_storage.__class__.__name__
        self.stdout.write(f'Default storage backend: {backend}')

        if backend != 'S3Boto3Storage':
            self.stdout.write(self.style.WARNING(
                'Not using R2. Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, '
                'R2_BUCKET_NAME, and R2_ENDPOINT_URL in .env to enable.'
            ))
            return

        self.stdout.write(f'Bucket: {settings.AWS_STORAGE_BUCKET_NAME}')
        self.stdout.write(f'Endpoint: {settings.AWS_S3_ENDPOINT_URL}')
        self.stdout.write(f'Media URL: {settings.MEDIA_URL}')

        test_path = 'health/_r2_verify.txt'
        payload = b'r2-roundtrip-ok'

        try:
            saved_path = default_storage.save(test_path, ContentFile(payload))
            self.stdout.write(self.style.SUCCESS(f'  write OK → {saved_path}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  write FAILED: {e}'))
            return

        try:
            with default_storage.open(saved_path, 'rb') as f:
                data = f.read()
            assert data == payload, f'payload mismatch: {data!r}'
            self.stdout.write(self.style.SUCCESS(f'  read OK ({len(data)} bytes)'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'  read FAILED: {e}'))
            return

        try:
            url = default_storage.url(saved_path)
            self.stdout.write(f'  URL: {url}')
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  url() failed: {e}'))

        try:
            default_storage.delete(saved_path)
            self.stdout.write(self.style.SUCCESS('  delete OK'))
        except Exception as e:
            self.stdout.write(self.style.WARNING(f'  delete failed: {e}'))

        self.stdout.write(self.style.SUCCESS('R2 verification passed.'))
