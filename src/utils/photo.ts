import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ImagePickerAsset } from 'expo-image-picker';
import { UploadPhoto } from '../api';

export const preparePhotoForUpload = async (
  asset: ImagePickerAsset,
  prefix: 'report' | 'proof',
): Promise<UploadPhoto> => {
  const image = ImageManipulator.manipulate(asset.uri);
  image.resize({ width: Math.min(asset.width || 1600, 1600) });
  const rendered = await image.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.78 });

  return {
    uri: saved.uri,
    name: `eco-${prefix}-${Date.now()}.jpg`,
    type: 'image/jpeg',
  };
};
