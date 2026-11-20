"""Kopiert App-Icon (ohne Alphakanal, wie Apple es verlangt) und erzeugt Startbildschirme für das iOS-Projekt."""
from PIL import Image
icon = Image.open('www/icons/icon-1024.png').convert('RGB')
icon.save('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
size = 2732
splash = Image.new('RGB', (size, size), (244, 245, 247))
logo = icon.resize((420, 420), Image.LANCZOS)
mask = Image.new('L', logo.size, 0)
from PIL import ImageDraw
ImageDraw.Draw(mask).rounded_rectangle([0, 0, 419, 419], radius=92, fill=255)
splash.paste(logo, ((size - 420) // 2, (size - 420) // 2), mask)
for n in ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']:
    splash.save(f'ios/App/App/Assets.xcassets/Splash.imageset/{n}', optimize=True)
print('iOS-Icons und Splash erstellt')
