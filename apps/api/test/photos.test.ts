import { describe, expect, it, vi } from 'vitest';
import { studentSummary } from '../src/common/serializers';
import { PhotoService } from '../src/modules/files/storage.service';

const student = (photoKey: string | null) => ({
  id: '11111111-1111-4111-8111-111111111111',
  code: '8888',
  status: 'ACTIVE',
  person: { id: '22222222-2222-4222-8222-222222222222', firstName: 'Ana', lastName: 'Prueba', birthDate: null, sex: 'F', photoKey },
});

describe('student photos (privacy)', () => {
  it('exposes a photo URL only for photos linked by the Phidias sync', () => {
    expect(studentSummary(student(null), { photosEnabled: true }).photoUrl).toBeNull();
    expect(studentSummary(student('8888.jpg'), { photosEnabled: false }).photoUrl).toBeNull();
    expect(studentSummary(student('8888.jpg'), { photosEnabled: true }).photoUrl).toBe('/api/v1/students/11111111-1111-4111-8111-111111111111/photo');
  });

  it('never probes the bucket by student code', async () => {
    const photos = new PhotoService();
    vi.spyOn(photos, 'enabled', 'get').mockReturnValue(true);
    const find = vi.spyOn(photos, 'find');
    // A demo or other-school student that shares a numeric code with a real student gets no photo.
    expect(await photos.signedUrl(null, '8888')).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });
});
