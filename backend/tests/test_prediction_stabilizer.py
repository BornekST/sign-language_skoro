import unittest

from app.prediction_stabilizer import PredictionStabilizer


class PredictionStabilizerTests(unittest.TestCase):
    def setUp(self):
        self.stabilizer = PredictionStabilizer()

    def test_emits_add_after_two_stable_frames(self):
        self.assertIsNone(self.stabilizer.process("A", 0.90))
        self.assertEqual(self.stabilizer.process("A", 0.90), {"type": "add", "value": "A"})

    def test_longer_second_letter_corrects_tentative_letter(self):
        self.stabilizer.process("A", 0.90)
        self.stabilizer.process("A", 0.90)
        self.assertIsNone(self.stabilizer.process("B", 0.90))
        self.assertIsNone(self.stabilizer.process("B", 0.90))
        self.assertEqual(self.stabilizer.process("B", 0.90), {"type": "replace", "value": "B"})

    def test_gap_finalizes_previous_letter(self):
        self.stabilizer.process("A", 0.90)
        self.stabilizer.process("A", 0.90)
        self.stabilizer.process(None, 0)
        self.stabilizer.process("B", 0.90)
        self.assertEqual(self.stabilizer.process("B", 0.90), {"type": "add", "value": "B"})

    def test_delete_uses_lower_confidence_threshold(self):
        self.assertIsNone(self.stabilizer.process("BRISANJE", 0.60))
        self.assertEqual(self.stabilizer.process("BRISANJE", 0.60), {"type": "delete"})


if __name__ == "__main__":
    unittest.main()
