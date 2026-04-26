from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Produto, Venda


class LojaVendaAPITest(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.create_user(username='lojatest', password='teste123', is_staff=True)
        self.p1 = Produto.objects.create(
            nome='Café', categoria='cantina', preco=Decimal('3.50'), ativo=True
        )
        self.p2 = Produto.objects.create(
            nome='Camiseta', categoria='loja', preco=Decimal('10.00'), ativo=True
        )

    def test_criar_venda_soma_total(self):
        self.client.force_authenticate(self.user)
        res = self.client.post(
            '/api/loja/vendas/',
            {
                'itens': [
                    {'produto': self.p1.id, 'quantidade': 2},
                    {'produto': self.p2.id, 'quantidade': 1},
                ],
                'meio_pagamento': 'dinheiro',
            },
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data['status'], 'rascunho')
        # 2*3.5 + 10 = 17.00
        self.assertEqual(Decimal(str(res.data['total'])), Decimal('17.00'))
        v = Venda.objects.get(pk=res.data['id'])
        self.assertEqual(v.recalcular_total(), Decimal('17.00'))
        self.assertEqual(v.itens.count(), 2)

    def test_lista_produtos_filtra_ativo(self):
        self.client.force_authenticate(self.user)
        Produto.objects.create(nome='X', categoria='loja', preco=1, ativo=False)
        res = self.client.get('/api/loja/produtos/', {'ativo': 'true'})
        self.assertEqual(res.status_code, 200)
        if 'results' in res.data:
            n = res.data['results']
        else:
            n = res.data
        self.assertTrue(len(n) >= 2)

    def test_venda_bloqueada_sem_estoque(self):
        self.p1.controla_estoque = True
        self.p1.estoque = 1
        self.p1.save()
        self.client.force_authenticate(self.user)
        res = self.client.post(
            '/api/loja/vendas/',
            {
                'itens': [{'produto': self.p1.id, 'quantidade': 3}],
                'meio_pagamento': 'dinheiro',
            },
            format='json',
        )
        self.assertEqual(res.status_code, 400, res.data)

    def test_dinheiro_baixa_estoque_uma_vez(self):
        self.p1.controla_estoque = True
        self.p1.estoque = 5
        self.p1.save()
        self.client.force_authenticate(self.user)
        res = self.client.post(
            '/api/loja/vendas/',
            {
                'itens': [{'produto': self.p1.id, 'quantidade': 2}],
                'meio_pagamento': 'dinheiro',
            },
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.data)
        vid = res.data['id']
        r2 = self.client.post(f'/api/loja/vendas/{vid}/registrar-pagamento-dinheiro/', {}, format='json')
        self.assertEqual(r2.status_code, 200, r2.data)
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.estoque, 3)
        v = Venda.objects.get(pk=vid)
        self.assertTrue(v.estoque_baixado)
        r3 = self.client.post(f'/api/loja/vendas/{vid}/registrar-pagamento-dinheiro/', {}, format='json')
        self.assertEqual(r3.status_code, 400)
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.estoque, 3)

    def test_excluir_venda_negado_sem_staff(self):
        User = get_user_model()
        u = User.objects.create_user(username='vendedor', password='x', is_staff=False)
        self.client.force_authenticate(self.user)
        res = self.client.post(
            '/api/loja/vendas/',
            {'itens': [{'produto': self.p1.id, 'quantidade': 1}], 'meio_pagamento': 'dinheiro'},
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.data)
        vid = res.data['id']
        self.client.force_authenticate(u)
        r = self.client.delete(f'/api/loja/vendas/{vid}/')
        self.assertEqual(r.status_code, 403, r.data)
        self.assertTrue(Venda.objects.filter(pk=vid).exists())

    def test_excluir_venda_staff_repor_estoque(self):
        self.p1.controla_estoque = True
        self.p1.estoque = 10
        self.p1.save()
        self.client.force_authenticate(self.user)
        res = self.client.post(
            '/api/loja/vendas/',
            {'itens': [{'produto': self.p1.id, 'quantidade': 2}], 'meio_pagamento': 'dinheiro'},
            format='json',
        )
        self.assertEqual(res.status_code, 201, res.data)
        vid = res.data['id']
        self.client.post(f'/api/loja/vendas/{vid}/registrar-pagamento-dinheiro/', {}, format='json')
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.estoque, 8)
        r = self.client.delete(f'/api/loja/vendas/{vid}/')
        self.assertEqual(r.status_code, 204, r.data)
        self.assertFalse(Venda.objects.filter(pk=vid).exists())
        self.p1.refresh_from_db()
        self.assertEqual(self.p1.estoque, 10)