// Lightweight i18n: English + French dictionaries for the shared UI. Product content stays in English.
export const LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];
export const RTL_LOCALES: string[] = ['ar', 'he', 'fa'];

const en = {
  'nav.catalog': 'Catalog', 'nav.collections': 'Collections', 'nav.free': 'Free assets', 'nav.help': 'Help', 'nav.account': 'Account', 'nav.signin': 'Sign in', 'nav.signout': 'Sign out', 'nav.admin': 'Admin', 'nav.cart': 'Cart',
  'search.placeholder': 'Search 3D models, e.g. "low-poly medieval props for mobile"', 'search.label': 'Search assets',
  'hero.title': '3D assets that ship.', 'hero.subtitle': 'Game-ready models, materials and add-ons with clear licenses, instant downloads and free updates.', 'hero.cta': 'Browse the catalog', 'hero.free': 'Get the free asset',
  'trust.secure': 'Secure checkout', 'trust.instant': 'Instant download', 'trust.license': 'License guarantee', 'trust.updates': 'Free updates',
  'home.featured': 'Featured', 'home.new': 'New releases', 'home.trending': 'Trending', 'home.staff': 'Staff picks', 'home.categories': 'Browse by category', 'home.newsletter': 'Get new releases and sales in your inbox', 'home.subscribe': 'Subscribe',
  'product.addToCart': 'Add to cart', 'product.inCart': 'In cart', 'product.license': 'License', 'product.specs': 'Technical specs', 'product.reviews': 'Reviews', 'product.changelog': 'Version history', 'product.related': 'You may also like', 'product.wishlist': 'Wishlist', 'product.free': 'Free', 'product.download': 'Get it free',
  'cart.title': 'Your cart', 'cart.empty': 'Your cart is empty', 'cart.checkout': 'Checkout', 'cart.subtotal': 'Subtotal', 'cart.discounts': 'Discounts', 'cart.tax': 'Tax', 'cart.total': 'Total', 'cart.remove': 'Remove',
  'footer.legal': 'Legal', 'footer.store': 'Store', 'footer.support': 'Support', 'footer.rights': 'All rights reserved.',
  'chat.open': 'Chat with support', 'chat.title': 'Support', 'chat.human': 'Talk to a human', 'chat.send': 'Send', 'chat.placeholder': 'Type your message…',
  'cookie.text': 'We use essential cookies to run the store. With your consent we also use privacy-friendly analytics.', 'cookie.accept': 'Accept analytics', 'cookie.reject': 'Reject', 'cookie.settings': 'Cookie policy',
};
type Dict = typeof en;
const fr: Dict = {
  'nav.catalog': 'Catalogue', 'nav.collections': 'Collections', 'nav.free': 'Gratuit', 'nav.help': 'Aide', 'nav.account': 'Compte', 'nav.signin': 'Connexion', 'nav.signout': 'Déconnexion', 'nav.admin': 'Admin', 'nav.cart': 'Panier',
  'search.placeholder': 'Rechercher des modèles 3D, ex. « accessoires médiévaux low-poly »', 'search.label': 'Rechercher',
  'hero.title': 'Des assets 3D prêts pour la production.', 'hero.subtitle': 'Modèles game-ready, matériaux et add-ons avec licences claires, téléchargement immédiat et mises à jour gratuites.', 'hero.cta': 'Voir le catalogue', 'hero.free': 'Asset gratuit du mois',
  'trust.secure': 'Paiement sécurisé', 'trust.instant': 'Téléchargement immédiat', 'trust.license': 'Licence garantie', 'trust.updates': 'Mises à jour gratuites',
  'home.featured': 'À la une', 'home.new': 'Nouveautés', 'home.trending': 'Tendances', 'home.staff': 'Coups de cœur', 'home.categories': 'Parcourir par catégorie', 'home.newsletter': 'Recevez les nouveautés et promotions', 'home.subscribe': "S'abonner",
  'product.addToCart': 'Ajouter au panier', 'product.inCart': 'Dans le panier', 'product.license': 'Licence', 'product.specs': 'Caractéristiques techniques', 'product.reviews': 'Avis', 'product.changelog': 'Historique des versions', 'product.related': 'Vous aimerez aussi', 'product.wishlist': 'Favoris', 'product.free': 'Gratuit', 'product.download': 'Obtenir gratuitement',
  'cart.title': 'Votre panier', 'cart.empty': 'Votre panier est vide', 'cart.checkout': 'Paiement', 'cart.subtotal': 'Sous-total', 'cart.discounts': 'Remises', 'cart.tax': 'Taxes', 'cart.total': 'Total', 'cart.remove': 'Retirer',
  'footer.legal': 'Mentions légales', 'footer.store': 'Boutique', 'footer.support': 'Assistance', 'footer.rights': 'Tous droits réservés.',
  'chat.open': "Discuter avec l'assistance", 'chat.title': 'Assistance', 'chat.human': 'Parler à un humain', 'chat.send': 'Envoyer', 'chat.placeholder': 'Votre message…',
  'cookie.text': "Nous utilisons des cookies essentiels au fonctionnement de la boutique. Avec votre accord, nous utilisons aussi des statistiques respectueuses de la vie privée.", 'cookie.accept': 'Accepter les statistiques', 'cookie.reject': 'Refuser', 'cookie.settings': 'Politique cookies',
};
const DICTS: Record<Locale, Dict> = { en, fr };
export type MessageKey = keyof Dict;

export function t(locale: string, key: MessageKey): string {
  return (DICTS[(locale as Locale) in DICTS ? (locale as Locale) : 'en'] ?? en)[key] ?? en[key];
}

export function dictFor(locale: string): Dict {
  return DICTS[(locale as Locale) in DICTS ? (locale as Locale) : 'en'];
}
